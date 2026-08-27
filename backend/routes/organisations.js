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
    let result;
    if (role === 'superAdmin') {
      result = await centralPool.query('SELECT * FROM organisations ORDER BY id ASC');
    } else {
      if (!org_ids || org_ids.length === 0) {
        return res.json({ organisations: [] });
      }
      result = await centralPool.query(
        'SELECT * FROM organisations WHERE id = ANY($1::int[]) ORDER BY id ASC',
        [org_ids]
      );
    }
    return res.json({ organisations: result.rows });
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