const { centralPool } = require('../db');

/**
 * Validates whether a user or their associated organisation is active, suspended, or expired.
 *
 * @param {object} user - User record from central database
 * @param {object} [pool=centralPool] - Postgres pool / client
 * @returns {Promise<{
 *   blocked: boolean,
 *   code?: 'ACCOUNT_DEACTIVATED' | 'ORGANISATION_SUSPENDED' | 'ORGANISATION_EXPIRED',
 *   error?: string,
 *   orgStatus?: 'suspended' | 'expired' | 'inactive' | 'active',
 *   message?: string,
 *   orgName?: string,
 *   organisations?: Array<object>
 * }>}
 */
async function validateUserAndOrgStatus(user, pool = centralPool) {
  if (!user) {
    return { blocked: true, code: 'USER_NOT_FOUND', message: 'User not found' };
  }

  const rawOrgIds = Array.isArray(user.org_ids) && user.org_ids.length > 0
    ? user.org_ids
    : (user.organisation_id ? [user.organisation_id] : []);

  const orgIds = Array.from(new Set(rawOrgIds.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n))));

  let organisations = [];
  if (orgIds.length > 0) {
    try {
      const orgsRes = await pool.query(
        `SELECT o.id, o.org_name, o.slug, o.is_active, o.status, o.start_date, o.end_date,
                t.token_status, t.token_end_date, t.license_id
         FROM organisations o
         LEFT JOIN LATERAL (
           SELECT status AS token_status, end_date AS token_end_date, license_id
           FROM org_tokens
           WHERE org_id = o.id
           ORDER BY id DESC
           LIMIT 1
         ) t ON true
         WHERE o.id = ANY($1::int[]) AND o.deleted_at IS NULL
         ORDER BY o.id ASC`,
        [orgIds]
      );
      organisations = orgsRes.rows || [];
    } catch (dbErr) {
      console.error('[validateUserAndOrgStatus] Error fetching orgs:', dbErr.message);
    }
  }

  const primaryOrgName = organisations[0]?.org_name || null;

  // 1. Check User Account Deactivation
  let isUserDeactivated = (user.is_active === false || user.status === 'inactive' || user.status === 'suspended');

  // Also check org_users table for non-superadmins
  if (!isUserDeactivated && user.role !== 'superAdmin' && user.email) {
    try {
      const orgUsersRes = await pool.query(
        'SELECT is_active, org_id FROM org_users WHERE LOWER(email) = LOWER($1)',
        [user.email]
      );
      if (orgUsersRes.rows.length > 0) {
        const activeMemberships = orgUsersRes.rows.filter((r) => r.is_active === true);
        if (activeMemberships.length === 0) {
          isUserDeactivated = true;
        }
      }
    } catch (err) {
      console.warn('[validateUserAndOrgStatus] Error checking org_users:', err.message);
    }
  }

  if (isUserDeactivated) {
    const deactivationMessage = primaryOrgName
      ? `You are deactivated from ${primaryOrgName}. Please contact your administrator.`
      : 'You are deactivated from this organisation. Please contact your administrator.';

    return {
      blocked: true,
      code: 'ACCOUNT_DEACTIVATED',
      error: 'ACCOUNT_DEACTIVATED',
      orgStatus: 'inactive',
      message: deactivationMessage,
      orgName: primaryOrgName,
      organisations,
    };
  }

  // SuperAdmins bypass organisation expiry/suspension checks
  if (user.role === 'superAdmin') {
    return {
      blocked: false,
      organisations: organisations.map((o) => ({
        ...o,
        is_active: true,
        is_suspended: false,
        is_expired: false,
        license_status: 'active',
        block_reason: null,
      })),
      orgName: primaryOrgName,
    };
  }

  // 2. Check Organisation Suspension and Expiration for tenant users
  if (organisations.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeOrgs = [];
    const suspendedOrgs = [];
    const expiredOrgs = [];

    const seenIds = new Set();
    const uniqueEnrichedOrgs = [];

    for (const org of organisations) {
      if (seenIds.has(org.id)) continue;
      seenIds.add(org.id);

      const isSuspended = org.is_active === false || org.status === 'suspended';
      const effectiveEndDate = org.token_end_date || org.end_date;
      const isDateExpired = effectiveEndDate && new Date(effectiveEndDate) < today;
      const isStatusExpired = org.status === 'expired' || org.token_status === 'expired';
      const isExpired = !isSuspended && (isDateExpired || isStatusExpired);

      let licenseStatus = 'active';
      let blockReason = null;

      if (isSuspended) {
        licenseStatus = 'suspended';
        blockReason = `Your organisation "${org.org_name}" has been suspended. Please contact your administrator.`;
        suspendedOrgs.push(org);
      } else if (isExpired) {
        licenseStatus = 'expired';
        blockReason = `Your organisation "${org.org_name}" subscription / license has expired. Please contact your administrator.`;
        expiredOrgs.push(org);
      } else {
        licenseStatus = 'active';
        activeOrgs.push(org);
      }

      uniqueEnrichedOrgs.push({
        ...org,
        is_active: !isSuspended,
        is_suspended: isSuspended,
        is_expired: isExpired,
        license_status: licenseStatus,
        block_reason: blockReason,
        effective_end_date: effectiveEndDate,
      });
    }

    // If the user has at least one active, valid organisation, allow access
    if (activeOrgs.length > 0) {
      return {
        blocked: false,
        organisations: uniqueEnrichedOrgs,
        activeOrgs,
        orgName: activeOrgs[0]?.org_name || primaryOrgName,
      };
    }

    // Otherwise, all connected organisations are suspended or expired
    if (suspendedOrgs.length > 0) {
      const targetOrg = suspendedOrgs[0];
      const name = targetOrg.org_name || primaryOrgName || 'this organisation';
      return {
        blocked: true,
        code: 'ORGANISATION_SUSPENDED',
        error: 'ORGANISATION_SUSPENDED',
        orgStatus: 'suspended',
        message: `Your organisation "${name}" has been suspended. Please contact your administrator.`,
        orgName: name,
        organisations: uniqueEnrichedOrgs,
      };
    }

    if (expiredOrgs.length > 0) {
      const targetOrg = expiredOrgs[0];
      const name = targetOrg.org_name || primaryOrgName || 'this organisation';
      return {
        blocked: true,
        code: 'ORGANISATION_EXPIRED',
        error: 'ORGANISATION_EXPIRED',
        orgStatus: 'expired',
        message: `Your organisation "${name}" subscription / license has expired. Please contact your administrator.`,
        orgName: name,
        organisations: uniqueEnrichedOrgs,
      };
    }
  }

  return {
    blocked: false,
    organisations,
    orgName: primaryOrgName,
  };
}

module.exports = {
  validateUserAndOrgStatus,
};
