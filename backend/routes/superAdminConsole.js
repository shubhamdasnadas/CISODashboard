const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { centralPool, getOrgPool, generateUniqueSlug, createOrgDatabase } = require('../db');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const { sendSuperAdminInviteEmail, sendUserInviteEmail } = require('../utils/mailer');
const {
  getDeploymentMode,
  generateToken,
  extendOrgToken,
  applyOfflineLicense,
  generateLicenseRequestCode,
} = require('../services/tokenService');

// Sync services
const { syncSentinelOne } = require('../services/sentinelone');
const { syncHexnode } = require('../services/hexnode');
const { syncFirewall } = require('../services/firewall');
const { syncHarmony } = require('../services/harmony');
const { syncScalefusion } = require('../services/scalefusion');

const router = express.Router();

// Enforce auth & superAdmin on all routes
router.use(authMiddleware, requireSuperAdmin);

// ─── AUDIT LOGGING HELPER ─────────────────────────────────────────────────────
async function logAudit(req, { target, target_type, action, details = {} }) {
  try {
    const actor = req.user?.username || 'superAdmin';
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    await centralPool.query(
      `INSERT INTO superadmin_audit_logs (actor, target, target_type, action, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [actor, String(target || 'system'), target_type || 'general', action, JSON.stringify(details), ip]
    );
  } catch (err) {
    console.warn('[superadmin-audit] Failed to write audit log:', err.message);
  }
}

// ─── DERIVED ORG STATUS HELPER ────────────────────────────────────────────────
function computeOrgStatus(org) {
  if (org.deleted_at) return 'deleted';
  if (org.status === 'suspended' || org.is_active === false) return 'suspended';
  if (org.token_status === 'revoked') return 'revoked';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startVal = org.token_start_date || org.start_date;
  if (startVal) {
    const start = new Date(startVal);
    start.setHours(0, 0, 0, 0);
    if (start > today) return 'upcoming';
  }

  const endVal = org.token_end_date || org.end_date;
  if (endVal) {
    const end = new Date(endVal);
    end.setHours(23, 59, 59, 999);
    if (end < today) return 'expired';
  }

  return 'active';
}

function computeDaysRemaining(endDateStr) {
  if (!endDateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr);
  end.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ─── TAB 1: ORGANISATIONS ENDPOINTS ──────────────────────────────────────────

/**
 * GET /api/superadmin/organisations
 * List organisations with pagination, search, filters, derived status, and user counts
 */
router.get('/organisations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const q = (req.query.q || '').trim().toLowerCase();
    const statusFilter = (req.query.status || 'all').toLowerCase();
    const planFilter = (req.query.plan || 'all').toLowerCase();
    const industryFilter = (req.query.industry || 'all').toLowerCase();
    const sortBy = req.query.sortBy || 'id';
    const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Base query for non-deleted orgs
    const queryParams = [];
    let whereClauses = ['o.deleted_at IS NULL'];

    if (q) {
      queryParams.push(`%${q}%`);
      const idx = queryParams.length;
      whereClauses.push(
        `(LOWER(o.org_name) LIKE $${idx} OR LOWER(COALESCE(o.slug, '')) LIKE $${idx} OR LOWER(COALESCE(o.email, '')) LIKE $${idx} OR LOWER(COALESCE(o.industry, '')) LIKE $${idx})`
      );
    }

    if (planFilter !== 'all') {
      queryParams.push(planFilter);
      whereClauses.push(`LOWER(COALESCE(o.plan, 'starter')) = $${queryParams.length}`);
    }

    if (industryFilter !== 'all') {
      queryParams.push(industryFilter);
      whereClauses.push(`LOWER(COALESCE(o.industry, '')) = $${queryParams.length}`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Fetch all matching rows with user count and latest token info
    const sql = `
      SELECT o.*,
        t.license_id,
        t.raw_token_preview,
        t.status AS token_status,
        t.start_date AS token_start_date,
        t.end_date AS token_end_date,
        t.last_extended_by,
        t.last_extended_at,
        t.expired_notified_at,
        (
          SELECT COUNT(*)::int
          FROM users u
          WHERE (u.organisation_id = o.id OR (u.org_ids IS NOT NULL AND o.id = ANY(u.org_ids)))
            AND u.deleted_at IS NULL
        ) AS users_count,
        (
          SELECT COUNT(*)::int
          FROM users u
          WHERE (u.organisation_id = o.id OR (u.org_ids IS NOT NULL AND o.id = ANY(u.org_ids)))
            AND u.is_active = TRUE
            AND u.deleted_at IS NULL
        ) AS active_users_count
      FROM organisations o
      LEFT JOIN LATERAL (
        SELECT license_id, raw_token_preview, status, start_date, end_date,
               last_extended_by, last_extended_at, expired_notified_at
        FROM org_tokens
        WHERE org_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) t ON TRUE
      ${whereSql}
      ORDER BY o.${['id', 'org_name', 'created_at', 'start_date', 'end_date', 'plan'].includes(sortBy) ? sortBy : 'id'} ${sortOrder}
    `;

    const { rows } = await centralPool.query(sql, queryParams);

    // Compute derived status and expiring soon flag for every org
    const processed = rows.map((org) => {
      const effectiveEndDate = org.token_end_date || org.end_date;
      const derivedStatus = computeOrgStatus(org);
      const daysRemaining = computeDaysRemaining(effectiveEndDate);
      const isExpiringSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 30;
      return {
        ...org,
        derived_status: derivedStatus,
        days_remaining: daysRemaining,
        is_expiring_soon: isExpiringSoon,
      };
    });

    // Filter by derived status if requested
    const filtered = statusFilter === 'all'
      ? processed
      : processed.filter((o) => o.derived_status === statusFilter);

    // Global summary counts across all organisations
    const allSummary = processed.reduce(
      (acc, o) => {
        acc.total += 1;
        if (o.derived_status === 'active') acc.active += 1;
        else if (o.derived_status === 'upcoming') acc.upcoming += 1;
        else if (o.derived_status === 'expired') acc.expired += 1;
        else if (o.derived_status === 'suspended') acc.suspended += 1;
        if (o.is_expiring_soon) acc.expiringSoon += 1;
        return acc;
      },
      { total: 0, active: 0, upcoming: 0, expired: 0, suspended: 0, expiringSoon: 0 }
    );

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return res.json({
      organisations: paginated,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
      counts: allSummary,
    });
  } catch (err) {
    console.error('[superadmin/organisations] list error:', err);
    return res.status(500).json({ error: 'Failed to fetch organisations', detail: err.message });
  }
});

/**
 * POST /api/superadmin/organisations
 * Create a new organisation + auto-create tenant database + optionally create initial admin user
 */
router.post('/organisations', async (req, res) => {
  try {
    const {
      org_name,
      slug: customSlug,
      email,
      industry,
      plan = 'starter',
      start_date,
      end_date,
      color,
      description,
      address,
      mobile_no,
      createAdminUser = false,
      adminName,
      adminEmail,
    } = req.body;

    if (!org_name || !org_name.trim()) {
      return res.status(400).json({ error: 'Organisation Name is required' });
    }
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start Date and End Date are required' });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    if (end <= start) {
      return res.status(400).json({ error: 'End Date must be after Start Date' });
    }

    // Auto-generate unique slug
    const finalSlug = await generateUniqueSlug(org_name.trim(), customSlug ? customSlug.trim() : null);

    const insertSql = `
      INSERT INTO organisations (
        org_name, slug, email, industry, plan, start_date, end_date,
        status, is_active, color, description, address, mobile_no,
        created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', TRUE, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *
    `;

    const { rows } = await centralPool.query(insertSql, [
      org_name.trim(),
      finalSlug,
      email ? email.trim() : null,
      industry ? industry.trim() : null,
      plan || 'starter',
      start_date,
      end_date,
      color || null,
      description || null,
      address || null,
      mobile_no || null,
      req.user.username || 'superAdmin',
    ]);

    const newOrg = rows[0];

    // Create per-org database
    try {
      await createOrgDatabase(finalSlug);
    } catch (dbErr) {
      console.error('[superadmin/organisations] DB creation warning:', dbErr.message);
    }

    let createdAdmin = null;

    // Create optional Org Admin User with Password Setup Email Invitation
    if (createAdminUser && adminEmail) {
      const adminUsername = (adminName || adminEmail.split('@')[0] || `${finalSlug}_admin`).trim();
      const adminEmailTrimmed = adminEmail.trim().toLowerCase();
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

      const userInsert = await centralPool.query(
        `INSERT INTO users (
           username, email, password, role, org_ids, organisation_id,
           is_active, status, password_setup_token, password_setup_expires_at,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, 'admin', $4, $5, FALSE, 'pending', $6, $7, NOW(), NOW())
         ON CONFLICT (username) DO NOTHING
         RETURNING id, username, email, role, is_active, status, password_setup_token, created_at`,
        [
          adminUsername,
          adminEmailTrimmed,
          placeholderHash,
          [newOrg.id],
          newOrg.id,
          token,
          expiresAt,
        ]
      );
      createdAdmin = userInsert.rows[0] || null;

      // Sync into org_users
      try {
        await centralPool.query(
          `INSERT INTO org_users (org_id, name, email, password, role, is_active)
           VALUES ($1, $2, $3, $4, 'org_admin', FALSE)
           ON CONFLICT (email, org_id) DO NOTHING`,
          [newOrg.id, adminUsername, adminEmailTrimmed, placeholderHash]
        );
      } catch (syncErr) {
        console.warn('[superadmin/organisations] org_users sync warning:', syncErr.message);
      }

      // Send password setup invitation email
      try {
        await sendUserInviteEmail({
          to: adminEmailTrimmed,
          name: adminUsername,
          phone: null,
          token,
          invitedBy: req.user?.username || 'SuperAdmin',
          role: 'admin',
          orgName: newOrg.org_name,
        });
      } catch (mailErr) {
        console.error('[superadmin/organisations] Failed to send invite email to org admin:', mailErr.message);
      }
    }

    // Auto-generate license token for the new organisation
    let tokenResult = null;
    try {
      tokenResult = await generateToken({
        orgId: newOrg.id,
        orgName: newOrg.org_name,
        slug: newOrg.slug,
        startDate: newOrg.start_date,
        endDate: newOrg.end_date,
        issuedBy: req.user?.username || 'SuperAdmin',
      });
    } catch (tokenErr) {
      console.error('[superadmin/organisations] Token generation warning:', tokenErr.message);
    }

    await logAudit(req, {
      target: newOrg.org_name,
      target_type: 'organisation',
      action: 'CREATE_ORGANISATION',
      details: {
        orgId: newOrg.id,
        slug: newOrg.slug,
        plan: newOrg.plan,
        createdAdmin: !!createdAdmin,
        licenseId: tokenResult?.licenseId,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Organisation created successfully',
      organisation: newOrg,
      licenseToken: tokenResult ? {
        rawToken: tokenResult.rawToken,
        licenseId: tokenResult.licenseId,
        preview: tokenResult.tokenRecord?.raw_token_preview,
        startDate: newOrg.start_date,
        endDate: newOrg.end_date,
        deploymentMode: tokenResult.deploymentMode,
      } : null,
      adminUser: createdAdmin ? { ...createdAdmin } : null,
    });
  } catch (err) {
    console.error('[superadmin/organisations] create error:', err);
    return res.status(500).json({ error: 'Failed to create organisation', detail: err.message });
  }
});

/**
 * PUT /api/superadmin/organisations/:id
 * Edit organisation details
 */
router.put('/organisations/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { org_name, email, industry, plan, start_date, end_date, address, mobile_no, description } = req.body;

    if (!org_name || !org_name.trim()) {
      return res.status(400).json({ error: 'Organisation Name is required' });
    }
    if (start_date && end_date && new Date(end_date) <= new Date(start_date)) {
      return res.status(400).json({ error: 'End Date must be after Start Date' });
    }

    const { rows } = await centralPool.query(
      `UPDATE organisations SET
         org_name = $1,
         email = $2,
         industry = $3,
         plan = $4,
         start_date = COALESCE($5, start_date),
         end_date = COALESCE($6, end_date),
         address = $7,
         mobile_no = $8,
         description = $9,
         updated_at = NOW()
       WHERE id = $10 AND deleted_at IS NULL
       RETURNING *`,
      [
        org_name.trim(),
        email ? email.trim() : null,
        industry ? industry.trim() : null,
        plan || 'starter',
        start_date || null,
        end_date || null,
        address || null,
        mobile_no || null,
        description || null,
        orgId,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found' });
    }

    await logAudit(req, {
      target: rows[0].org_name,
      target_type: 'organisation',
      action: 'UPDATE_ORGANISATION',
      details: { orgId, plan: rows[0].plan },
    });

    return res.json({ success: true, message: 'Organisation updated successfully', organisation: rows[0] });
  } catch (err) {
    console.error('[superadmin/organisations] update error:', err);
    return res.status(500).json({ error: 'Failed to update organisation', detail: err.message });
  }
});

/**
 * PATCH /api/superadmin/organisations/:id/status
 * Toggle Activate / Suspend status
 */
router.patch('/organisations/:id/status', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { status } = req.body; // 'active' or 'suspended'

    const newStatus = status === 'suspended' ? 'suspended' : 'active';
    const isActive = newStatus === 'active';

    const { rows } = await centralPool.query(
      `UPDATE organisations SET
         status = $1,
         is_active = $2,
         updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [newStatus, isActive, orgId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found' });
    }

    await logAudit(req, {
      target: rows[0].org_name,
      target_type: 'organisation',
      action: newStatus === 'suspended' ? 'SUSPEND_ORGANISATION' : 'ACTIVATE_ORGANISATION',
      details: { orgId, newStatus },
    });

    return res.json({
      success: true,
      message: `Organisation ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully`,
      organisation: rows[0],
    });
  } catch (err) {
    console.error('[superadmin/organisations] status error:', err);
    return res.status(500).json({ error: 'Failed to change status', detail: err.message });
  }
});

/**
 * PATCH /api/superadmin/orgs/:id/token/extend
 * PATCH /api/superadmin/organisations/:id/token/extend
 * POST /api/superadmin/organisations/:id/extend
 * Extend validity (SuperAdmin only in online mode)
 */
async function handleExtendToken(req, res) {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { newEndDate, new_end_date, reason, extend_months } = req.body;

    let targetDate = newEndDate || new_end_date;

    if (!targetDate && extend_months) {
      const months = parseInt(extend_months, 10) || 12;
      const curRes = await centralPool.query('SELECT end_date FROM organisations WHERE id = $1', [orgId]);
      const currentEnd = curRes.rows[0]?.end_date ? new Date(curRes.rows[0].end_date) : new Date();
      currentEnd.setMonth(currentEnd.getMonth() + months);
      targetDate = currentEnd.toISOString().split('T')[0];
    }

    if (!targetDate) {
      return res.status(400).json({ error: 'New end date is required (YYYY-MM-DD)' });
    }

    const result = await extendOrgToken({
      orgId,
      newEndDate: targetDate,
      reason: reason || 'Validity extended by SuperAdmin',
      actor: req.user?.username || 'SuperAdmin',
    });

    const { rows: updatedOrg } = await centralPool.query(
      'SELECT * FROM organisations WHERE id = $1',
      [orgId]
    );

    return res.json({
      success: true,
      message: result.message,
      tokenRecord: result.tokenRecord,
      organisation: updatedOrg[0],
    });
  } catch (err) {
    console.error('[superadmin/token/extend] error:', err);
    return res.status(400).json({ error: err.message });
  }
}

router.patch('/orgs/:id/token/extend', handleExtendToken);
router.patch('/organisations/:id/token/extend', handleExtendToken);
router.post('/organisations/:id/extend', handleExtendToken);

/**
 * POST /api/superadmin/orgs/:id/token/generate
 * POST /api/superadmin/organisations/:id/token/generate
 * Generate / Regenerate a license token for an organisation.
 * Returns raw token ONCE for the SuperAdmin to copy.
 */
async function handleGenerateToken(req, res) {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { rows: orgRows } = await centralPool.query(
      'SELECT id, org_name, slug, start_date, end_date FROM organisations WHERE id = $1 AND deleted_at IS NULL',
      [orgId]
    );

    if (orgRows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found' });
    }

    const org = orgRows[0];
    const gen = await generateToken({
      orgId: org.id,
      orgName: org.org_name,
      slug: org.slug,
      startDate: org.start_date || new Date(),
      endDate: org.end_date || new Date(Date.now() + 365 * 86400000),
      issuedBy: req.user?.username || 'SuperAdmin',
    });

    await logAudit(req, {
      target: org.org_name,
      target_type: 'ORGANISATION_TOKEN',
      action: 'GENERATE_TOKEN',
      details: { orgId: org.id, licenseId: gen.licenseId, deploymentMode: gen.deploymentMode },
    });

    return res.json({
      success: true,
      message: 'License token generated successfully',
      rawToken: gen.rawToken,
      licenseId: gen.licenseId,
      preview: gen.tokenRecord?.raw_token_preview,
      startDate: gen.tokenRecord?.start_date,
      endDate: gen.tokenRecord?.end_date,
      deploymentMode: gen.deploymentMode,
    });
  } catch (err) {
    console.error('[superadmin/token/generate] error:', err);
    return res.status(500).json({ error: 'Failed to generate token', detail: err.message });
  }
}

router.post('/orgs/:id/token/generate', handleGenerateToken);
router.post('/organisations/:id/token/generate', handleGenerateToken);

/**
 * GET /api/superadmin/license/config
 * Returns deployment mode and license engine configuration.
 */
router.get('/license/config', (_req, res) => {
  const deploymentMode = getDeploymentMode();
  return res.json({
    deploymentMode,
    hasPublicKey: !!process.env.LICENSE_PUBLIC_KEY,
    hasPrivateKey: !!process.env.LICENSE_PRIVATE_KEY,
    vendorEmail: process.env.VENDOR_SUPERADMIN_EMAIL || null,
  });
});

/**
 * POST /api/superadmin/license/apply
 * Upload / paste a signed offline license token.
 */
router.post('/license/apply', async (req, res) => {
  try {
    const { signedLicense } = req.body;
    if (!signedLicense) {
      return res.status(400).json({ error: 'signedLicense string is required' });
    }

    const result = await applyOfflineLicense({
      signedLicense,
      actor: req.user?.username || 'Admin',
    });

    return res.json(result);
  } catch (err) {
    console.error('[superadmin/license/apply] error:', err);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/license/request-code/:orgId
 * Generate offline license request code blob for the organisation.
 */
router.get('/license/request-code/:orgId', async (req, res) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    const result = await generateLicenseRequestCode(orgId);
    return res.json(result);
  } catch (err) {
    console.error('[superadmin/license/request-code] error:', err);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/superadmin/organisations/:id
 * Soft-delete organisation (requires confirming org name)
 */
router.delete('/organisations/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { confirmOrgName } = req.body || {};

    const existing = await centralPool.query(
      'SELECT id, org_name, slug FROM organisations WHERE id = $1 AND deleted_at IS NULL',
      [orgId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found' });
    }

    const org = existing.rows[0];

    if (confirmOrgName && confirmOrgName.trim().toLowerCase() !== org.org_name.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Organisation name does not match confirmation' });
    }

    // Soft-delete
    await centralPool.query(
      `UPDATE organisations SET
         deleted_at = NOW(),
         is_active = FALSE,
         status = 'suspended'
       WHERE id = $1`,
      [orgId]
    );

    await logAudit(req, {
      target: org.org_name,
      target_type: 'organisation',
      action: 'SOFT_DELETE_ORGANISATION',
      details: { orgId, slug: org.slug },
    });

    return res.json({ success: true, message: `Organisation "${org.org_name}" soft-deleted successfully` });
  } catch (err) {
    console.error('[superadmin/organisations] delete error:', err);
    return res.status(500).json({ error: 'Failed to delete organisation', detail: err.message });
  }
});

/**
 * GET /api/superadmin/organisations/:id/details
 * Consolidated endpoint returning all popup data:
 * - Org info, validity, days remaining, created/updated
 * - Users statistics + latest 5 users
 * - Integration activity status + last sync
 * - Last 5 audit trail entries
 */
router.get('/organisations/:id/details', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);

    const { rows: orgRows } = await centralPool.query(
      'SELECT * FROM organisations WHERE id = $1 AND deleted_at IS NULL',
      [orgId]
    );

    if (orgRows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found' });
    }

    const org = orgRows[0];
    const derivedStatus = computeOrgStatus(org);
    const daysRemaining = computeDaysRemaining(org.end_date);
    const isExpiringSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 30;

    // 0. Fetch latest token info
    const tokenRes = await centralPool.query(
      `SELECT license_id, raw_token_preview, status, start_date, end_date,
              issued_by, issued_at, last_extended_by, last_extended_at, expired_notified_at
       FROM org_tokens
       WHERE org_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [orgId]
    );
    const tokenRecord = tokenRes.rows[0] || null;

    // 1. Users statistics & latest 5 users
    const userStatsRes = await centralPool.query(
      `SELECT
         COUNT(*)::int AS total_users,
         COUNT(CASE WHEN is_active = TRUE THEN 1 END)::int AS active_users,
         COUNT(CASE WHEN is_active = FALSE THEN 1 END)::int AS inactive_users,
         COUNT(CASE WHEN role IN ('admin', 'org_admin') THEN 1 END)::int AS admin_users
       FROM users
       WHERE (organisation_id = $1 OR (org_ids IS NOT NULL AND $1 = ANY(org_ids)))
         AND deleted_at IS NULL`,
      [orgId]
    );
    const userStats = userStatsRes.rows[0] || { total_users: 0, active_users: 0, inactive_users: 0, admin_users: 0 };

    const latestUsersRes = await centralPool.query(
      `SELECT id, username, email, role, is_active, last_login_at, created_at
       FROM users
       WHERE (organisation_id = $1 OR (org_ids IS NOT NULL AND $1 = ANY(org_ids)))
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 5`,
      [orgId]
    );

    // 2. Integration connection status & credentials in tenant DB
    const integrations = [
      { key: 'sentinelone', name: 'SentinelOne (EDR)', connected: false, lastSync: null, status: 'Not Configured' },
      { key: 'firewall', name: 'Palo Alto / Firewall', connected: false, lastSync: null, status: 'Not Configured' },
      { key: 'harmony', name: 'Check Point / Harmony', connected: false, lastSync: null, status: 'Not Configured' },
      { key: 'scalefusion', name: 'ScaleFusion (MDM)', connected: false, lastSync: null, status: 'Not Configured' },
      { key: 'hexnode', name: 'Hexnode (MDM)', connected: false, lastSync: null, status: 'Not Configured' },
      { key: 'zoho', name: 'Zoho One (Ticketing)', connected: false, lastSync: null, status: 'Not Configured' },
    ];

    try {
      const orgPool = getOrgPool(org.slug);
      const { rows: creds } = await orgPool.query('SELECT integration, created_at, updated_at FROM integration_credentials');
      const credMap = {};
      creds.forEach((c) => { credMap[c.integration] = c; });

      // Check api_responses for last fetch times
      const { rows: responses } = await orgPool.query(
        'SELECT api_name, fetched_at FROM api_responses ORDER BY fetched_at DESC'
      );
      const respMap = {};
      responses.forEach((r) => { if (!respMap[r.api_name]) respMap[r.api_name] = r.fetched_at; });

      integrations.forEach((item) => {
        if (credMap[item.key]) {
          item.connected = true;
          item.status = 'Connected';
          item.lastSync = respMap[item.key] || credMap[item.key].updated_at || credMap[item.key].created_at;
        }
      });
    } catch {
      // Per-org DB might not have table or be unavailable
    }

    // 3. Last login activity in this organisation
    const lastLoginRes = await centralPool.query(
      `SELECT login_time, username FROM user_logs
       WHERE username IN (
         SELECT username FROM users
         WHERE (organisation_id = $1 OR (org_ids IS NOT NULL AND $1 = ANY(org_ids)))
       )
       ORDER BY login_time DESC
       LIMIT 1`,
      [orgId]
    );
    const lastActivity = lastLoginRes.rows[0] || null;

    // 4. Audit trail (last 5 entries)
    const auditRes = await centralPool.query(
      `SELECT id, actor, target, target_type, action, details, ip_address, created_at
       FROM superadmin_audit_logs
       WHERE target = $1 OR (details->>'orgId')::text = $2
       ORDER BY created_at DESC
       LIMIT 5`,
      [org.org_name, String(orgId)]
    );

    return res.json({
      success: true,
      organisation: {
        ...org,
        derived_status: derivedStatus,
        days_remaining: daysRemaining,
        is_expiring_soon: isExpiringSoon,
        token: tokenRecord,
        deploymentMode: getDeploymentMode(),
      },
      users: {
        stats: userStats,
        latest: latestUsersRes.rows,
      },
      activity: {
        lastLogin: lastActivity,
        integrations,
      },
      auditTrail: auditRes.rows,
    });
  } catch (err) {
    console.error('[superadmin/organisations/details] error:', err);
    return res.status(500).json({ error: 'Failed to fetch organisation details', detail: err.message });
  }
});

// ─── TAB 2: USERS ENDPOINTS ──────────────────────────────────────────────────

/**
 * GET /api/superadmin/users
 * Searchable, filterable, paginated user directory
 */
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const q = (req.query.q || '').trim().toLowerCase();
    const orgIdFilter = req.query.org_id || 'all';
    const roleFilter = (req.query.role || 'all').toLowerCase();
    const statusFilter = (req.query.status || 'all').toLowerCase();

    const queryParams = [];
    const whereClauses = ['u.deleted_at IS NULL'];

    if (q) {
      queryParams.push(`%${q}%`);
      const idx = queryParams.length;
      whereClauses.push(`(LOWER(u.username) LIKE $${idx} OR LOWER(COALESCE(u.email, '')) LIKE $${idx})`);
    }

    if (orgIdFilter !== 'all') {
      const orgIdNum = parseInt(orgIdFilter, 10);
      if (!isNaN(orgIdNum)) {
        queryParams.push(orgIdNum);
        whereClauses.push(`(u.organisation_id = $${queryParams.length} OR (u.org_ids IS NOT NULL AND $${queryParams.length} = ANY(u.org_ids)))`);
      }
    }

    if (roleFilter !== 'all') {
      queryParams.push(roleFilter);
      whereClauses.push(`LOWER(u.role) = $${queryParams.length}`);
    }

    if (statusFilter !== 'all') {
      const isActiveVal = statusFilter === 'active';
      queryParams.push(isActiveVal);
      whereClauses.push(`u.is_active = $${queryParams.length}`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const countRes = await centralPool.query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
      queryParams
    );
    const total = countRes.rows[0]?.total || 0;

    const dataSql = `
      SELECT
        u.id, u.username, u.email, u.phone_number, u.role, u.is_active, u.status,
        (u.status = 'pending' OR u.password_setup_token IS NOT NULL) AS is_pending_setup,
        u.must_change_password,
        u.last_login_at, u.created_at, u.organisation_id, u.org_ids,
        COALESCE(
          (SELECT array_agg(json_build_object('id', o.id, 'org_name', o.org_name, 'slug', o.slug))
           FROM organisations o
           WHERE (o.id = u.organisation_id OR (u.org_ids IS NOT NULL AND o.id = ANY(u.org_ids))) AND o.deleted_at IS NULL),
          ARRAY[]::json[]
        ) AS organisations
      FROM users u
      ${whereSql}
      ORDER BY u.id DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const { rows: userList } = await centralPool.query(dataSql, [...queryParams, limit, offset]);

    return res.json({
      users: userList,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error('[superadmin/users] list error:', err);
    return res.status(500).json({ error: 'Failed to fetch users', detail: err.message });
  }
});

/**
 * POST /api/superadmin/users
 * Add new user or assign existing user (by email) to an organisation with Password Setup Email Invitation flow
 */
router.post('/users', async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      phone_number,
      phone_no,
      organisation_id,
      org_ids,
      role = 'member',
      confirmPassword,
      allowed_pages,
    } = req.body;

    const userName = (name || username || '').trim();
    const userEmail = (email || '').trim().toLowerCase();
    const userPhone = (phone_number || phone_no || '').trim();

    if (!userName) {
      return res.status(400).json({ error: 'Full Name / Username is required' });
    }
    if (!userEmail) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Optional SuperAdmin authorization password check
    if (confirmPassword) {
      const isPasswordValid = await verifyCurrentAdminPassword(req.user.userId, confirmPassword);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Incorrect authorization password' });
      }
    }

    const orgIdNum = organisation_id ? parseInt(organisation_id, 10) : null;
    const requestedOrgIds = Array.isArray(org_ids)
      ? org_ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n))
      : (orgIdNum ? [orgIdNum] : []);

    // ─── CHECK IF USER WITH THIS EMAIL ALREADY EXISTS ───────────────────────
    const existing = await centralPool.query(
      `SELECT id, username, email, phone_number, role, organisation_id, org_ids,
              is_active, status, password, password_setup_token, password_setup_expires_at
       FROM users
       WHERE LOWER(email) = $1 AND deleted_at IS NULL`,
      [userEmail]
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];

      // If user exists, we assign / link the requested organisation(s) to this user
      if (requestedOrgIds.length === 0 && !orgIdNum) {
        return res.status(400).json({
          error: `A user with email "${userEmail}" already exists. Please select an organisation to add them to.`,
        });
      }

      const currentOrgIds = Array.isArray(existingUser.org_ids)
        ? existingUser.org_ids.map(Number)
        : (existingUser.organisation_id ? [Number(existingUser.organisation_id)] : []);

      // Check if user is already assigned to all requested orgs
      const targetOrgIdsToAdd = requestedOrgIds.filter((id) => !currentOrgIds.includes(id));
      if (targetOrgIdsToAdd.length === 0) {
        let orgName = 'this organisation';
        if (orgIdNum) {
          const oRes = await centralPool.query('SELECT org_name FROM organisations WHERE id = $1', [orgIdNum]);
          orgName = oRes.rows[0]?.org_name || 'this organisation';
        }
        return res.status(400).json({
          error: `User "${existingUser.username}" (${userEmail}) is already a member of ${orgName}.`,
        });
      }

      // Merge new org IDs into the user's org_ids array
      const updatedOrgIds = Array.from(new Set([...currentOrgIds, ...requestedOrgIds]));

      const { rows: updatedRows } = await centralPool.query(
        `UPDATE users SET
           org_ids = $1,
           organisation_id = COALESCE(organisation_id, $2),
           phone_number = COALESCE($3, phone_number),
           allowed_pages = COALESCE($4, allowed_pages),
           updated_at = NOW()
         WHERE id = $5
         RETURNING id, username, email, phone_number, role, organisation_id, org_ids, is_active, status, password_setup_token`,
        [
          updatedOrgIds,
          orgIdNum || updatedOrgIds[0] || null,
          userPhone || null,
          Array.isArray(allowed_pages) ? allowed_pages : null,
          existingUser.id,
        ]
      );

      const updatedUser = updatedRows[0];

      // Sync into org_users table for all new orgs
      for (const orgId of targetOrgIdsToAdd) {
        try {
          await centralPool.query(
            `INSERT INTO org_users (org_id, name, email, password, role, is_active, allowed_pages)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (email, org_id) DO UPDATE SET
               name = EXCLUDED.name,
               role = EXCLUDED.role,
               is_active = EXCLUDED.is_active,
               allowed_pages = EXCLUDED.allowed_pages,
               updated_at = NOW()`,
            [
              orgId,
              existingUser.username || userName,
              userEmail,
              existingUser.password,
              role === 'admin' ? 'org_admin' : 'org_user',
              existingUser.is_active,
              Array.isArray(allowed_pages) ? allowed_pages : null,
            ]
          );
        } catch (syncErr) {
          console.warn(`[superadmin/users] org_users sync warning for org ${orgId}:`, syncErr.message);
        }
      }

      // Fetch org names for display/notification
      const orgNamesRes = await centralPool.query(
        'SELECT org_name FROM organisations WHERE id = ANY($1::int[])',
        [targetOrgIdsToAdd]
      );
      const addedOrgNames = orgNamesRes.rows.map((r) => r.org_name).join(', ') || 'Organisation';

      // Send email notification:
      // If user status is pending, send/resend password setup invitation.
      // If user status is active, send welcome/added to org notification.
      try {
        let setupToken = existingUser.password_setup_token;
        if (!setupToken || (existingUser.password_setup_expires_at && new Date(existingUser.password_setup_expires_at).getTime() < Date.now())) {
          setupToken = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await centralPool.query(
            `UPDATE users SET password_setup_token = $1, password_setup_expires_at = $2, updated_at = NOW() WHERE id = $3`,
            [setupToken, expiresAt, existingUser.id]
          );
        }

        await sendUserInviteEmail({
          to: userEmail,
          name: existingUser.username || userName,
          phone: userPhone || existingUser.phone_number || null,
          token: setupToken,
          invitedBy: req.user?.username || 'SuperAdmin',
          role: role || existingUser.role || 'member',
          orgName: addedOrgNames,
          req,
        });
      } catch (mailErr) {
        console.error('[superadmin/users] Failed to send email on adding existing user to org:', mailErr.message);
      }

      await logAudit(req, {
        target: existingUser.username,
        target_type: 'user',
        action: 'ADD_USER_TO_ORGANISATION',
        details: {
          userId: existingUser.id,
          email: userEmail,
          role,
          addedOrgIds: targetOrgIdsToAdd,
          allOrgIds: updatedOrgIds,
          orgNames: addedOrgNames,
        },
      });

      return res.status(200).json({
        success: true,
        message: `User "${existingUser.username}" (${userEmail}) has been successfully added to organisation "${addedOrgNames}".`,
        user: updatedUser,
        linkedExisting: true,
      });
    }

    // ─── BRAND NEW USER CREATION ─────────────────────────────────────────────
    // Handle username conflict if a different email already used this exact username
    let finalUsername = userName;
    const existingUsername = await centralPool.query(
      'SELECT id FROM users WHERE LOWER(username) = $1 AND deleted_at IS NULL',
      [userName.toLowerCase()]
    );
    if (existingUsername.rows.length > 0) {
      finalUsername = `${userName}_${Math.floor(100 + Math.random() * 900)}`;
    }

    // Generate secure 32-byte setup token & placeholder hash
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const { rows } = await centralPool.query(
      `INSERT INTO users (
         username, email, phone_number, password, role, organisation_id, org_ids,
         is_active, status, password_setup_token, password_setup_expires_at,
         allowed_pages, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 'pending', $8, $9, $10, NOW(), NOW())
       RETURNING id, username, email, phone_number, role, organisation_id, org_ids, is_active, status, password_setup_token, created_at`,
      [
        finalUsername,
        userEmail,
        userPhone || null,
        placeholderHash,
        role || 'member',
        orgIdNum,
        requestedOrgIds,
        token,
        expiresAt,
        Array.isArray(allowed_pages) ? allowed_pages : null,
      ]
    );

    const newUser = rows[0];

    // Fetch org name for display in email
    let orgName = null;
    if (orgIdNum) {
      const orgRes = await centralPool.query('SELECT org_name FROM organisations WHERE id = $1', [orgIdNum]);
      orgName = orgRes.rows[0]?.org_name || null;

      // Sync into org_users table
      try {
        await centralPool.query(
          `INSERT INTO org_users (org_id, name, email, password, role, is_active, allowed_pages)
           VALUES ($1, $2, $3, $4, $5, FALSE, $6)
           ON CONFLICT (email, org_id) DO UPDATE SET
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             is_active = FALSE,
             allowed_pages = EXCLUDED.allowed_pages,
             updated_at = NOW()`,
          [
            orgIdNum,
            finalUsername,
            userEmail,
            placeholderHash,
            role === 'admin' ? 'org_admin' : 'org_user',
            Array.isArray(allowed_pages) ? allowed_pages : null,
          ]
        );
      } catch (syncErr) {
        console.warn('[superadmin/users] org_users sync warning:', syncErr.message);
      }
    }

    // Send invitation email with setup link
    try {
      await sendUserInviteEmail({
        to: userEmail,
        name: finalUsername,
        phone: userPhone || null,
        token,
        invitedBy: req.user?.username || 'SuperAdmin',
        role: role || 'member',
        orgName,
        req,
      });
    } catch (mailErr) {
      console.error('[superadmin/users] Failed to send invite email:', mailErr.message);
    }

    await logAudit(req, {
      target: newUser.username,
      target_type: 'user',
      action: 'INVITE_USER',
      details: { userId: newUser.id, email: newUser.email, role: newUser.role, orgId: orgIdNum, status: 'pending' },
    });

    return res.status(201).json({
      success: true,
      message: `User "${finalUsername}" created with status Pending. Invitation email sent to ${userEmail}.`,
      user: newUser,
    });
  } catch (err) {
    console.error('[superadmin/users] create error:', err);
    return res.status(500).json({ error: 'Failed to create user', detail: err.message });
  }
});

/**
 * POST /api/superadmin/users/:id/resend-invite
 * Resend password setup invitation email for a user
 */
router.post('/users/:id/resend-invite', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { rows } = await centralPool.query(
      'SELECT id, username, email, phone_number, role, organisation_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await centralPool.query(
      `UPDATE users SET
         password_setup_token = $1,
         password_setup_expires_at = $2,
         status = 'pending',
         is_active = FALSE,
         updated_at = NOW()
       WHERE id = $3`,
      [token, expiresAt, userId]
    );

    let orgName = null;
    if (user.organisation_id) {
      const orgRes = await centralPool.query('SELECT org_name FROM organisations WHERE id = $1', [user.organisation_id]);
      orgName = orgRes.rows[0]?.org_name || null;
    }

    await sendUserInviteEmail({
      to: user.email,
      name: user.username,
      phone: user.phone_number || null,
      token,
      invitedBy: req.user?.username || 'SuperAdmin',
      role: user.role || 'member',
      orgName,
      req,
    });

    await logAudit(req, {
      target: user.username,
      target_type: 'user',
      action: 'RESEND_USER_INVITE',
      details: { userId, email: user.email },
    });

    return res.json({
      success: true,
      message: `Password setup invitation email resent to ${user.email}.`,
    });
  } catch (err) {
    console.error('[superadmin/users] resend invite error:', err);
    return res.status(500).json({ error: 'Failed to resend invitation email', detail: err.message });
  }
});

/**
 * PUT /api/superadmin/users/:id
 * Edit user — if email is changed, also send a password setup email to the new email address
 */
router.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const {
      username,
      name,
      email,
      phone_number,
      phone_no,
      role,
      organisation_id,
      org_ids,
      is_active,
      allowed_pages,
    } = req.body;

    // 1. Fetch current user
    const { rows: existingRows } = await centralPool.query(
      `SELECT id, username, email, phone_number, role, organisation_id, org_ids, is_active, status, password
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = existingRows[0];
    const currentEmail = (currentUser.email || '').trim().toLowerCase();
    const rawNewEmail = (email !== undefined && email !== null) ? String(email).trim().toLowerCase() : currentEmail;
    const newEmail = rawNewEmail || null;
    const newUsername = (username || name) ? String(username || name).trim() : currentUser.username;
    const newPhone = (phone_number !== undefined || phone_no !== undefined)
      ? ((phone_number || phone_no) ? String(phone_number || phone_no).trim() : null)
      : currentUser.phone_number;
    const newRole = role || currentUser.role;

    const orgIdNum = organisation_id !== undefined
      ? (organisation_id ? parseInt(organisation_id, 10) : null)
      : currentUser.organisation_id;
    const orgIdsArray = Array.isArray(org_ids)
      ? org_ids.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n))
      : (orgIdNum ? [orgIdNum] : (currentUser.org_ids || []));

    const newIsActive = typeof is_active === 'boolean' ? is_active : currentUser.is_active;
    const newAllowedPages = allowed_pages !== undefined
      ? (Array.isArray(allowed_pages) ? allowed_pages : null)
      : currentUser.allowed_pages;

    // Determine if email has changed
    const emailChanged = Boolean(newEmail && newEmail !== currentEmail);

    let token = null;
    let expiresAt = null;
    let newStatus = currentUser.status;

    if (emailChanged) {
      // Check unique email across users
      const emailConflict = await centralPool.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2 AND deleted_at IS NULL',
        [newEmail, userId]
      );
      if (emailConflict.rows.length > 0) {
        return res.status(400).json({ error: 'A user with this email address already exists' });
      }

      // Generate a fresh 32-byte password setup token and 24h expiration
      token = crypto.randomBytes(32).toString('hex');
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      newStatus = 'pending';
    }

    // 2. Perform DB update
    const { rows: updatedRows } = await centralPool.query(
      `UPDATE users SET
         username = $1,
         email = $2,
         phone_number = $3,
         role = $4,
         organisation_id = $5,
         org_ids = $6,
         is_active = $7,
         status = $8,
         password_setup_token = CASE WHEN $9::text IS NOT NULL THEN $9::text ELSE password_setup_token END,
         password_setup_expires_at = CASE WHEN $10::timestamptz IS NOT NULL THEN $10::timestamptz ELSE password_setup_expires_at END,
         allowed_pages = $11,
         updated_at = NOW()
       WHERE id = $12 AND deleted_at IS NULL
       RETURNING id, username, email, phone_number, role, organisation_id, org_ids, is_active, status, password_setup_token`,
      [
        newUsername,
        newEmail,
        newPhone,
        newRole,
        orgIdNum,
        orgIdsArray,
        emailChanged ? false : newIsActive,
        newStatus,
        token,
        expiresAt,
        newAllowedPages,
        userId,
      ]
    );

    const updatedUser = updatedRows[0];

    // 3. Sync into org_users table
    if (newEmail && orgIdNum) {
      try {
        if (emailChanged && currentEmail) {
          await centralPool.query('DELETE FROM org_users WHERE LOWER(email) = LOWER($1)', [currentEmail]);
        }

        await centralPool.query(
          `INSERT INTO org_users (org_id, name, email, password, role, is_active, allowed_pages)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (email, org_id) DO UPDATE SET
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             is_active = EXCLUDED.is_active,
             allowed_pages = EXCLUDED.allowed_pages,
             updated_at = NOW()`,
          [
            orgIdNum,
            newUsername,
            newEmail,
            currentUser.password || '',
            newRole === 'admin' ? 'org_admin' : 'org_user',
            emailChanged ? false : newIsActive,
            newAllowedPages,
          ]
        );
      } catch (syncErr) {
        console.warn('[superadmin/users] org_users sync warning:', syncErr.message);
      }
    }

    // 4. Send password setup email ONLY IF email changed
    let emailSent = false;
    if (emailChanged && newEmail && token) {
      try {
        if (newRole === 'superAdmin') {
          await sendSuperAdminInviteEmail({
            to: newEmail,
            name: newUsername,
            phone: newPhone || null,
            token,
            invitedBy: req.user?.username || 'SuperAdmin',
            req,
          });
          emailSent = true;
        } else {
          let orgName = null;
          if (orgIdNum) {
            const orgRes = await centralPool.query('SELECT org_name FROM organisations WHERE id = $1', [orgIdNum]);
            orgName = orgRes.rows[0]?.org_name || null;
          }
          await sendUserInviteEmail({
            to: newEmail,
            name: newUsername,
            phone: newPhone || null,
            token,
            invitedBy: req.user?.username || 'SuperAdmin',
            role: newRole,
            orgName,
            req,
          });
          emailSent = true;
        }
      } catch (mailErr) {
        console.error('[superadmin/users] Failed to send invite email on email change:', mailErr.message);
      }
    }

    // 5. Audit log
    await logAudit(req, {
      target: updatedUser.username,
      target_type: newRole === 'superAdmin' ? 'superAdmin' : 'user',
      action: emailChanged ? 'UPDATE_USER_EMAIL' : 'UPDATE_USER',
      details: {
        userId,
        oldEmail: currentEmail,
        newEmail,
        emailChanged,
        emailSent,
        role: updatedUser.role,
        orgId: orgIdNum,
      },
    });

    const responseMsg = emailChanged
      ? `User updated successfully. Email changed to ${newEmail} and password setup email has been sent.`
      : 'User updated successfully.';

    return res.json({
      success: true,
      message: responseMsg,
      user: updatedUser,
      emailChanged,
      emailSent,
    });
  } catch (err) {
    console.error('[superadmin/users] update error:', err);
    return res.status(500).json({ error: 'Failed to update user', detail: err.message });
  }
});

/**
 * POST /api/superadmin/users/:id/reset-password
 * Reset user password with temporary password
 */
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const tempPassword = crypto.randomBytes(6).toString('hex') + 'A1!';
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const { rows } = await centralPool.query(
      `UPDATE users SET
         password = $1,
         must_change_password = TRUE,
         updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, username, email`,
      [hashedPassword, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAudit(req, {
      target: rows[0].username,
      target_type: 'user',
      action: 'RESET_PASSWORD',
      details: { userId },
    });

    return res.json({
      success: true,
      message: 'Password reset successfully',
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    console.error('[superadmin/users] reset-password error:', err);
    return res.status(500).json({ error: 'Failed to reset password', detail: err.message });
  }
});

/**
 * PATCH /api/superadmin/users/:id/status
 * Activate / Deactivate user
 */
router.patch('/users/:id/status', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const { rows } = await centralPool.query(
      `UPDATE users SET
         is_active = $1,
         updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, username, email, is_active`,
      [Boolean(is_active), userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAudit(req, {
      target: rows[0].username,
      target_type: 'user',
      action: rows[0].is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      details: { userId, is_active: rows[0].is_active },
    });

    return res.json({
      success: true,
      message: `User ${rows[0].is_active ? 'activated' : 'deactivated'} successfully`,
      user: rows[0],
    });
  } catch (err) {
    console.error('[superadmin/users] status error:', err);
    return res.status(500).json({ error: 'Failed to update user status', detail: err.message });
  }
});

/**
 * DELETE /api/superadmin/users/:id
 * Delete or soft-delete user
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Prevent deleting self
    if (req.user.userId === userId) {
      return res.status(400).json({ error: 'You cannot delete your own active account' });
    }

    const { rows } = await centralPool.query(
      `UPDATE users SET
         deleted_at = NOW(),
         is_active = FALSE
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, username`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAudit(req, {
      target: rows[0].username,
      target_type: 'user',
      action: 'DELETE_USER',
      details: { userId },
    });

    return res.json({ success: true, message: `User "${rows[0].username}" deleted successfully` });
  } catch (err) {
    console.error('[superadmin/users] delete error:', err);
    return res.status(500).json({ error: 'Failed to delete user', detail: err.message });
  }
});

// ─── TAB 3: SUPER ADMINS ENDPOINTS ───────────────────────────────────────────

/**
 * Helper: verify current SuperAdmin's password
 */
async function verifyCurrentAdminPassword(currentUserId, passwordToVerify) {
  if (!passwordToVerify) return false;
  const res = await centralPool.query('SELECT password FROM users WHERE id = $1', [currentUserId]);
  if (res.rows.length === 0) return false;
  return bcrypt.compare(passwordToVerify, res.rows[0].password);
}

/**
 * GET /api/superadmin/admins
 * List all SuperAdmins
 */
router.get('/admins', async (req, res) => {
  try {
    const { rows } = await centralPool.query(`
      SELECT
        u.id, u.username, u.email, u.phone_number, u.role, u.is_active, u.org_ids,
        COALESCE(
          (SELECT array_agg(json_build_object('id', o.id, 'org_name', o.org_name))
             FROM organisations o WHERE o.id = ANY(u.org_ids)),
          ARRAY[]::json[]
        ) AS organisations,
        COALESCE(u.status, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END) AS status,
        u.password_setup_token, u.password_setup_expires_at,
        u.last_login_at, u.created_at,
        EXISTS (
          SELECT 1 FROM login_sessions ls
          WHERE ls.user_id = u.id AND ls.status = 'verified'
        ) AS mfa_enabled
      FROM users u
      WHERE u.role = 'superAdmin' AND u.deleted_at IS NULL
      ORDER BY u.id ASC
    `);

    // Format status: if password_setup_token is present or status='pending', flag as pending
    const formattedAdmins = rows.map((adm) => {
      const isPending = adm.status === 'pending' || Boolean(adm.password_setup_token);
      return {
        ...adm,
        status: isPending ? 'pending' : adm.is_active ? 'active' : 'inactive',
        is_pending_setup: isPending,
      };
    });

    return res.json({
      admins: formattedAdmins,
      total: formattedAdmins.length,
      currentAdminId: req.user.userId,
    });
  } catch (err) {
    console.error('[superadmin/admins] list error:', err);
    return res.status(500).json({ error: 'Failed to fetch SuperAdmins', detail: err.message });
  }
});

/**
 * POST /api/superadmin/admins
 * Create a new SuperAdmin with organisation access and email invitation
 */
router.post('/admins', async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      phone_no,
      phone_number,
      org_ids,
      confirmPassword,
    } = req.body;

    const superAdminName = (name || username || '').trim();
    const superAdminEmail = (email || '').trim().toLowerCase();
    const superAdminPhone = (phone_number || phone_no || '').trim();

    if (!superAdminName) {
      return res.status(400).json({ error: 'SuperAdmin Name is required' });
    }
    if (!superAdminEmail) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Optional password verification if provided
    if (confirmPassword) {
      const isPasswordValid = await verifyCurrentAdminPassword(req.user.userId, confirmPassword);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Incorrect authorization password' });
      }
    }

    const existing = await centralPool.query(
      'SELECT id FROM users WHERE (LOWER(email) = $1 OR LOWER(username) = $2) AND deleted_at IS NULL',
      [superAdminEmail, superAdminName.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A user with this email or username already exists' });
    }

    // Parse org_ids (if not provided, assign all active organisations for full access)
    let parsedOrgIds = [];
    if (Array.isArray(org_ids) && org_ids.length > 0) {
      parsedOrgIds = org_ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n));
    } else {
      const allOrgs = await centralPool.query('SELECT id FROM organisations WHERE is_active = TRUE AND deleted_at IS NULL');
      parsedOrgIds = allOrgs.rows.map((r) => r.id);
    }

    // Generate secure 32-byte setup token valid for 24 hours
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create an unguessable placeholder password hash until setup link is used
    const placeholderSecret = crypto.randomBytes(32).toString('hex');
    const placeholderHash = await bcrypt.hash(placeholderSecret, 10);

    const { rows } = await centralPool.query(
      `INSERT INTO users (
         username, email, phone_number, password, role, org_ids, is_active, status,
         password_setup_token, password_setup_expires_at, must_change_password, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'superAdmin', $5, FALSE, 'pending', $6, $7, FALSE, NOW(), NOW())
       RETURNING id, username, email, phone_number, role, org_ids, is_active, status, password_setup_token, created_at`,
      [superAdminName, superAdminEmail, superAdminPhone || null, placeholderHash, parsedOrgIds, token, expiresAt]
    );

    const newAdmin = rows[0];

    // Dispatch branded invitation email matching Image #23
    let emailResult = { dev: true };
    try {
      emailResult = await sendSuperAdminInviteEmail({
        to: superAdminEmail,
        name: superAdminName,
        phone: superAdminPhone || null,
        token,
        invitedBy: req.user?.username || 'SuperAdmin',
        req,
      });
    } catch (mailErr) {
      console.error('[superadmin/admins] Mail send failed:', mailErr.message);
    }

    await logAudit(req, {
      target: newAdmin.username,
      target_type: 'superAdmin',
      action: 'INVITE_SUPER_ADMIN',
      details: {
        adminId: newAdmin.id,
        email: newAdmin.email,
        phone: superAdminPhone,
        org_ids: parsedOrgIds,
        status: 'pending',
      },
    });

    return res.status(201).json({
      success: true,
      message: `SuperAdmin "${newAdmin.username}" created with status Pending. Invitation email sent to ${newAdmin.email}.`,
      admin: {
        ...newAdmin,
        status: 'pending',
        is_pending_setup: true,
      },
      emailSent: !emailResult?.smtpFailed,
    });
  } catch (err) {
    console.error('[superadmin/admins] create error:', err);
    return res.status(500).json({ error: 'Failed to create SuperAdmin', detail: err.message });
  }
});

/**
 * POST /api/superadmin/admins/:id/resend-invite
 * Resend password setup link to pending SuperAdmin
 */
router.post('/admins/:id/resend-invite', async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);

    const { rows: adminRows } = await centralPool.query(
      'SELECT id, username, email, phone_number, role, is_active, status FROM users WHERE id = $1 AND role = \'superAdmin\' AND deleted_at IS NULL',
      [adminId]
    );

    if (adminRows.length === 0) {
      return res.status(404).json({ error: 'SuperAdmin not found' });
    }

    const admin = adminRows[0];

    // Generate a fresh setup token and 24h expiration
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await centralPool.query(
      `UPDATE users SET
         password_setup_token = $1,
         password_setup_expires_at = $2,
         status = 'pending',
         is_active = FALSE,
         updated_at = NOW()
       WHERE id = $3`,
      [token, expiresAt, adminId]
    );

    // Send invitation email
    await sendSuperAdminInviteEmail({
      to: admin.email,
      name: admin.username,
      phone: admin.phone_number || null,
      token,
      invitedBy: req.user?.username || 'SuperAdmin',
      req,
    });

    await logAudit(req, {
      target: admin.username,
      target_type: 'superAdmin',
      action: 'RESEND_SUPER_ADMIN_INVITE',
      details: { adminId: admin.id, email: admin.email },
    });

    return res.json({
      success: true,
      message: `Password setup email resent to ${admin.email}.`,
    });
  } catch (err) {
    console.error('[superadmin/admins] resend-invite error:', err);
    return res.status(500).json({ error: 'Failed to resend invite', detail: err.message });
  }
});

/**
 * PATCH /api/superadmin/admins/:id/status
 * Activate / Deactivate SuperAdmin (safety checks: not self, not last admin)
 */
router.patch('/admins/:id/status', async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { is_active, confirmPassword } = req.body;

    if (!confirmPassword) {
      return res.status(400).json({ error: 'Please enter your current SuperAdmin password to confirm' });
    }

    const isPasswordValid = await verifyCurrentAdminPassword(req.user.userId, confirmPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Incorrect authorization password' });
    }

    if (adminId === req.user.userId && !is_active) {
      return res.status(400).json({ error: 'You cannot deactivate your own SuperAdmin account' });
    }

    // Check count of active SuperAdmins
    if (!is_active) {
      const activeCountRes = await centralPool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'superAdmin' AND is_active = TRUE AND deleted_at IS NULL"
      );
      if ((activeCountRes.rows[0]?.count || 0) <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last remaining active SuperAdmin' });
      }
    }

    const { rows } = await centralPool.query(
      `UPDATE users SET
         is_active = $1,
         updated_at = NOW()
       WHERE id = $2 AND role = 'superAdmin' AND deleted_at IS NULL
       RETURNING id, username, email, is_active`,
      [Boolean(is_active), adminId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'SuperAdmin not found' });
    }

    await logAudit(req, {
      target: rows[0].username,
      target_type: 'superAdmin',
      action: rows[0].is_active ? 'ACTIVATE_SUPER_ADMIN' : 'DEACTIVATE_SUPER_ADMIN',
      details: { adminId, is_active: rows[0].is_active },
    });

    return res.json({
      success: true,
      message: `SuperAdmin ${rows[0].is_active ? 'activated' : 'deactivated'} successfully`,
      admin: rows[0],
    });
  } catch (err) {
    console.error('[superadmin/admins] status error:', err);
    return res.status(500).json({ error: 'Failed to update SuperAdmin status', detail: err.message });
  }
});

/**
 * DELETE /api/superadmin/admins/:id
 * Delete SuperAdmin (safety checks: not self, not last admin)
 */
router.delete('/admins/:id', async (req, res) => {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { confirmPassword } = req.body || {};

    if (!confirmPassword) {
      return res.status(400).json({ error: 'Please enter your current SuperAdmin password to authorize deletion' });
    }

    const isPasswordValid = await verifyCurrentAdminPassword(req.user.userId, confirmPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Incorrect authorization password' });
    }

    if (adminId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own SuperAdmin account' });
    }

    const adminCountRes = await centralPool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'superAdmin' AND deleted_at IS NULL"
    );
    if ((adminCountRes.rows[0]?.count || 0) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining SuperAdmin' });
    }

    const { rows } = await centralPool.query(
      `UPDATE users SET
         deleted_at = NOW(),
         is_active = FALSE
       WHERE id = $1 AND role = 'superAdmin' AND deleted_at IS NULL
       RETURNING id, username`,
      [adminId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'SuperAdmin not found' });
    }

    await logAudit(req, {
      target: rows[0].username,
      target_type: 'superAdmin',
      action: 'DELETE_SUPER_ADMIN',
      details: { adminId },
    });

    return res.json({ success: true, message: `SuperAdmin "${rows[0].username}" deleted successfully` });
  } catch (err) {
    console.error('[superadmin/admins] delete error:', err);
    return res.status(500).json({ error: 'Failed to delete SuperAdmin', detail: err.message });
  }
});

// ─── INTEGRATION SYNC & CONTEXT SWITCHING ────────────────────────────────────

/**
 * POST /api/superadmin/organisations/:id/sync
 * Run all integrations sync for the target organisation
 */
router.post('/organisations/:id/sync', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);

    const { rows: orgRows } = await centralPool.query(
      'SELECT id, org_name, slug, status, is_active FROM organisations WHERE id = $1 AND deleted_at IS NULL',
      [orgId]
    );

    if (orgRows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found' });
    }

    const org = orgRows[0];
    const orgPool = getOrgPool(org.slug);

    const { rows: credsRows } = await orgPool.query(
      'SELECT integration, credentials FROM integration_credentials'
    );

    const creds = {};
    credsRows.forEach((r) => { creds[r.integration] = r.credentials; });

    const results = {};

    if (creds.sentinelone) {
      try { results.sentinelone = await syncSentinelOne(org.id, creds.sentinelone); } catch (e) { results.sentinelone = { error: e.message }; }
    }
    if (creds.hexnode) {
      try { results.hexnode = await syncHexnode(org.id, creds.hexnode); } catch (e) { results.hexnode = { error: e.message }; }
    }
    if (creds.firewall) {
      try { results.firewall = await syncFirewall(org.id, creds.firewall); } catch (e) { results.firewall = { error: e.message }; }
    }
    if (creds.harmony) {
      try { results.harmony = await syncHarmony(org.id, creds.harmony); } catch (e) { results.harmony = { error: e.message }; }
    }
    if (creds.scalefusion) {
      try { results.scalefusion = await syncScalefusion(org.slug, creds.scalefusion); } catch (e) { results.scalefusion = { error: e.message }; }
    }

    await logAudit(req, {
      target: org.org_name,
      target_type: 'organisation',
      action: 'SYNC_ORGANISATION_INTEGRATIONS',
      details: { orgId: org.id, slug: org.slug, synced: Object.keys(results) },
    });

    return res.json({
      success: true,
      message: `Sync completed for ${org.org_name}`,
      orgId: org.id,
      slug: org.slug,
      results,
    });
  } catch (err) {
    console.error('[superadmin/sync] error:', err);
    return res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
});

/**
 * POST /api/superadmin/exit-organisation
 * Audit log that SuperAdmin exited organization context
 */
router.post('/exit-organisation', async (req, res) => {
  try {
    const { orgId, orgName } = req.body || {};
    await logAudit(req, {
      target: orgName || String(orgId || 'org'),
      target_type: 'organisation',
      action: 'EXIT_ORGANISATION_VIEW',
      details: { orgId, orgName },
    });
    return res.json({ success: true, message: 'Exited organisation context' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to record exit', detail: err.message });
  }
});

module.exports = router;
