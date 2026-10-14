const express = require('express');
const { centralPool, getOrgSlug, generateUniqueSlug, createOrgDatabase, dropOrgDatabase } = require('../db');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const {
  unpackLicenseKey,
  verifyOfflineLicenseSignature,
  activateLicenseKey,
  toDateString,
} = require('../services/tokenService');

const router = express.Router();

/**
 * GET /api/organisations
 * Always uses the central pool — orgs are identity / registry data.
 * - superAdmin sees all orgs
 * - admin/member sees only their own orgs
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { role, org_ids } = req.user;
    const cleanOrgIds = Array.isArray(org_ids)
      ? Array.from(new Set(org_ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n))))
      : [];

    let result;
    if (role === 'superAdmin') {
      result = await centralPool.query(`
        SELECT o.*,
               t.token_status,
               t.token_start_date,
               t.token_end_date,
               t.license_id
        FROM organisations o
        LEFT JOIN LATERAL (
          SELECT status AS token_status, start_date AS token_start_date, end_date AS token_end_date, license_id
          FROM org_tokens
          WHERE org_id = o.id
          ORDER BY id DESC
          LIMIT 1
        ) t ON true
        WHERE o.deleted_at IS NULL
        ORDER BY o.id ASC
      `);
    } else {
      if (cleanOrgIds.length === 0) {
        return res.json({ organisations: [] });
      }
      result = await centralPool.query(`
        SELECT o.*,
               t.token_status,
               t.token_start_date,
               t.token_end_date,
               t.license_id
        FROM organisations o
        LEFT JOIN LATERAL (
          SELECT status AS token_status, start_date AS token_start_date, end_date AS token_end_date, license_id
          FROM org_tokens
          WHERE org_id = o.id
          ORDER BY id DESC
          LIMIT 1
        ) t ON true
        WHERE o.id = ANY($1::int[]) AND o.deleted_at IS NULL
        ORDER BY o.id ASC
      `, [cleanOrgIds]);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const seenIds = new Set();
    const enrichedOrgs = [];

    for (const org of (result.rows || [])) {
      if (seenIds.has(org.id)) continue;
      seenIds.add(org.id);

      const hasActiveToken = org.token_status === 'active';
      const effectiveEndDate = hasActiveToken && org.token_end_date ? org.token_end_date : org.end_date;
      const startStr = toDateString(org.token_start_date || org.start_date);
      const endStr = toDateString(effectiveEndDate);
      const isSameDate = Boolean(startStr && endStr && startStr === endStr);

      const isDateExpired = Boolean(endStr && new Date(endStr) < today);
      const isStatusExpired = org.status === 'expired' || org.token_status === 'expired' || org.token_status === 'pending_activation';
      const isExpired = isSameDate || isDateExpired || isStatusExpired;
      const isSuspended = !isExpired && (org.status === 'suspended' || (org.is_active === false && org.status !== 'active'));

      let licenseStatus = 'active';
      let blockReason = null;

      if (isExpired) {
        licenseStatus = 'expired';
        blockReason = `Your organisation "${org.org_name}" subscription / license has expired. Please contact your administrator.`;
      } else if (isSuspended) {
        licenseStatus = 'suspended';
        blockReason = `Your organisation "${org.org_name}" has been suspended. Please contact your administrator.`;
      }

      enrichedOrgs.push({
        ...org,
        is_active: !isSuspended,
        is_suspended: isSuspended,
        is_expired: isExpired,
        license_status: licenseStatus,
        block_reason: blockReason,
        effective_end_date: effectiveEndDate,
      });
    }

    return res.json({ organisations: enrichedOrgs });
  } catch (err) {
    console.error('list orgs error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/organisations
 * superAdmin only — add a new organisation.
 * Creates the org registry row AND its per-org database.
 */
router.post('/', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { org_name, address, mobile_no, slug } = req.body;
    if (!org_name) return res.status(400).json({ error: 'org_name is required' });

    // Derive a unique, safe slug for the per-org database name (ciso_org_<slug>).
    const orgSlug = await generateUniqueSlug(org_name, slug);

    const result = await centralPool.query(
      `INSERT INTO organisations (org_name, address, mobile_no, slug)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [org_name, address || null, mobile_no || null, orgSlug]
    );
    const newOrg = result.rows[0];

    // Create the per-org DB and apply the schema. If it fails, roll back the
    // registry row so we never leave an org with no database.
    try {
      await createOrgDatabase(orgSlug);
    } catch (e) {
      await centralPool.query('DELETE FROM organisations WHERE id = $1', [newOrg.id]);
      console.error('create org DB error (rolled back org row):', e);
      return res.status(500).json({ error: 'Failed to create organisation database' });
    }

    return res.status(201).json({ organisation: newOrg });
  } catch (err) {
    console.error('create org error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/organisations/:id
 * superAdmin only — drops both the registry row and the per-org database.
 */
router.delete('/:id', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const orgSlug = await getOrgSlug(id);
    await centralPool.query('DELETE FROM organisations WHERE id = $1', [id]);
    if (orgSlug) {
      try {
        await dropOrgDatabase(orgSlug);
      } catch (e) {
        console.error(`Warning: failed to drop ciso_org_${orgSlug}:`, e.message);
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('delete org error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/organisations/:id/verify-key
 * Dry-run inspection and validation of a pasted license key for a specific organisation.
 */
router.post('/:id/verify-key', authMiddleware, async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { licenseKey, rawToken, token } = req.body;
    const inputKey = (licenseKey || rawToken || token || '').trim();

    if (!inputKey) {
      return res.status(400).json({ valid: false, error: 'License key string is required' });
    }

    const { rows } = await centralPool.query(
      'SELECT id, org_name, slug, end_date, status FROM organisations WHERE id = $1 AND deleted_at IS NULL',
      [orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ valid: false, error: 'Organisation not found' });
    }
    const org = rows[0];

    // Try custom binary format: ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
    const unpacked = unpackLicenseKey(inputKey);
    if (unpacked) {
      const matchesOrg =
        Number(unpacked.orgId) === org.id ||
        String(unpacked.orgId).toLowerCase() === String(org.slug).toLowerCase() ||
        String(unpacked.orgId).toLowerCase() === String(org.id).toLowerCase();

      const todayStr = new Date().toISOString().slice(0, 10);
      const isSameDate = Boolean(unpacked.startDate && unpacked.endDate && unpacked.startDate === unpacked.endDate);
      const isExpired = unpacked.endDate < todayStr || isSameDate;
      const daysDiff = Math.round((new Date(unpacked.endDate) - new Date(todayStr)) / 86400000);

      return res.json({
        valid: !isExpired && (matchesOrg || req.user.role === 'superAdmin'),
        format: 'Custom Binary Key (33-byte packed)',
        version: unpacked.version,
        orgId: unpacked.orgId,
        targetOrgId: org.id,
        targetOrgName: org.org_name,
        matchesOrg,
        startDate: unpacked.startDate,
        endDate: unpacked.endDate,
        currentEndDate: org.end_date ? toDateString(org.end_date) : null,
        isExpired,
        daysRemaining: Math.max(0, daysDiff),
        licenseId: unpacked.licenseId,
        licenseIdHex: unpacked.licenseIdHex,
        formatString: unpacked.formatString,
      });
    }

    // Try signed offline license signature (JWT)
    const sigCheck = verifyOfflineLicenseSignature(inputKey);
    if (sigCheck.valid && sigCheck.payload) {
      const payload = sigCheck.payload;
      const matchesOrg =
        !payload.org_id ||
        Number(payload.org_id) === org.id ||
        (payload.slug && String(payload.slug).toLowerCase() === String(org.slug).toLowerCase());

      const todayStr = new Date().toISOString().slice(0, 10);
      const startDate = toDateString(payload.start_date) || todayStr;
      const endDate = toDateString(payload.end_date);
      const isSameDate = Boolean(startDate && endDate && startDate === endDate);
      const isExpired = (endDate && endDate < todayStr) || isSameDate;
      const daysDiff = endDate ? Math.round((new Date(endDate) - new Date(todayStr)) / 86400000) : 0;

      return res.json({
        valid: !isExpired && (matchesOrg || req.user.role === 'superAdmin'),
        format: 'Cryptographically Signed Offline License',
        orgId: payload.org_id,
        targetOrgId: org.id,
        targetOrgName: org.org_name,
        matchesOrg,
        startDate: toDateString(payload.start_date) || todayStr,
        endDate,
        currentEndDate: org.end_date ? toDateString(org.end_date) : null,
        isExpired,
        daysRemaining: Math.max(0, daysDiff),
        licenseId: payload.license_id,
        parsedKey: payload.parsed_key || null,
      });
    }

    return res.status(400).json({
      valid: false,
      error: 'Invalid license key format. Key must be in format: ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)',
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

/**
 * POST /api/organisations/:id/activate-key
 * Activates a license key for the specified organisation, extends validity,
 * restores status to 'active', and grants access to the workspace.
 */
router.post('/:id/activate-key', authMiddleware, async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const { licenseKey, rawToken, token } = req.body;
    const inputKey = (licenseKey || rawToken || token || '').trim();

    if (!inputKey) {
      return res.status(400).json({ error: 'License key string is required' });
    }

    // Permission check: superAdmin or user belonging to this org
    const userOrgIds = Array.isArray(req.user.org_ids)
      ? req.user.org_ids.map(Number)
      : (req.user.organisation_id ? [Number(req.user.organisation_id)] : []);

    if (req.user.role !== 'superAdmin' && !userOrgIds.includes(orgId)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions for this organisation.' });
    }

    const actor = req.user?.username || req.user?.email || 'User';
    const result = await activateLicenseKey({
      licenseKey: inputKey,
      targetOrgId: orgId,
      actor,
      client: centralPool,
    });

    return res.json(result);
  } catch (err) {
    console.error('[organisations/:id/activate-key] error:', err);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/organisations/activate-key
 * Activates a license key without specifying an ID in URL (resolves org from key payload).
 */
router.post('/activate-key', authMiddleware, async (req, res) => {
  try {
    const { licenseKey, rawToken, token, orgId } = req.body;
    const inputKey = (licenseKey || rawToken || token || '').trim();

    if (!inputKey) {
      return res.status(400).json({ error: 'License key string is required' });
    }

    const actor = req.user?.username || req.user?.email || 'User';
    const result = await activateLicenseKey({
      licenseKey: inputKey,
      targetOrgId: orgId ? parseInt(orgId, 10) : null,
      actor,
      client: centralPool,
    });

    return res.json(result);
  } catch (err) {
    console.error('[organisations/activate-key] error:', err);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;