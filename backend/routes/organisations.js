const express = require('express');
const { centralPool, getOrgSlug, generateUniqueSlug, createOrgDatabase, dropOrgDatabase } = require('../db');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');

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
               t.token_end_date,
               t.license_id
        FROM organisations o
        LEFT JOIN LATERAL (
          SELECT status AS token_status, end_date AS token_end_date, license_id
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
               t.token_end_date,
               t.license_id
        FROM organisations o
        LEFT JOIN LATERAL (
          SELECT status AS token_status, end_date AS token_end_date, license_id
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
      } else if (isExpired) {
        licenseStatus = 'expired';
        blockReason = `Your organisation "${org.org_name}" subscription / license has expired. Please contact your administrator.`;
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

module.exports = router;