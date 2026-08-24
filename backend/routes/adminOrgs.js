const express = require('express');
const router = express.Router();
const { centralPool, getOrgPool, getOrgSlug, closeOrgPool, ensureOrgDatabases } = require('../db');
const { requireSuperAdmin } = require('../middleware/authMiddleware');

// All admin org routes require superAdmin
router.use(requireSuperAdmin);

// GET /api/admin/organizations  — list all orgs with member counts
router.get('/organizations', async (req, res) => {
  try {
    const { rows } = await centralPool.query(
      `SELECT o.*,
         (SELECT COUNT(*) FROM org_users WHERE org_id = o.id AND is_active = TRUE) AS member_count
       FROM organisations o ORDER BY o.id`
    );
    res.json({ organizations: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/organizations/:id
router.get('/organizations/:id', async (req, res) => {
  try {
    const { rows } = await centralPool.query('SELECT * FROM organisations WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Organization not found' });
    res.json({ organization: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/organizations
router.post('/organizations', async (req, res) => {
  try {
    const { org_name, address, mobile_no, slug, email, industry, plan, color, description } = req.body;
    if (!org_name) return res.status(400).json({ message: 'org_name is required' });

    const { rows } = await centralPool.query(
      `INSERT INTO organisations (org_name, address, mobile_no, slug, email, industry, plan, color, description, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING *`,
      [org_name, address || null, mobile_no || null, slug || null, email || null, industry || null, plan || 'free', color || null, description || null]
    );
    // Auto-create per-org database + schema
    await ensureOrgDatabases();
    res.status(201).json({ organization: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/organizations/:id
router.put('/organizations/:id', async (req, res) => {
  try {
    const { org_name, address, mobile_no, slug, email, industry, plan, color, description, is_active } = req.body;
    await centralPool.query(
      `UPDATE organisations SET
         org_name = COALESCE($1, org_name),
         address = COALESCE($2, address),
         mobile_no = COALESCE($3, mobile_no),
         slug = COALESCE($4, slug),
         email = COALESCE($5, email),
         industry = COALESCE($6, industry),
         plan = COALESCE($7, plan),
         color = COALESCE($8, color),
         description = COALESCE($9, description),
         is_active = COALESCE($10, is_active)
       WHERE id = $11`,
      [org_name, address, mobile_no, slug, email, industry, plan, color, description, is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/organizations/:id
router.delete('/organizations/:id', async (req, res) => {
  try {
    const orgSlug = await getOrgSlug(parseInt(req.params.id, 10));
    await centralPool.query('DELETE FROM organisations WHERE id = $1', [req.params.id]);
    if (orgSlug) closeOrgPool(orgSlug);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/org-users?orgId=1
router.get('/org-users', async (req, res) => {
  try {
    const { orgId } = req.query;
    const condition = orgId ? 'WHERE org_id = $1' : '';
    const params = orgId ? [orgId] : [];
    const { rows } = await centralPool.query(
      `SELECT id, org_id, name, email, role, department, is_active, allowed_pages, created_at FROM org_users ${condition} ORDER BY created_at DESC`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/org-users
router.post('/org-users', async (req, res) => {
  try {
    const bcrypt = require('bcrypt');
    const { org_id, name, email, password, role, department, allowed_pages } = req.body;
    if (!org_id || !name || !email) {
      return res.status(400).json({ message: 'org_id, name, email are required' });
    }
    const hashed = password ? await bcrypt.hash(password, 10) : null;
    const { rows } = await centralPool.query(
      `INSERT INTO org_users (org_id, name, email, password, role, department, allowed_pages)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (email, org_id) DO UPDATE SET
         name = EXCLUDED.name,
         role = COALESCE(EXCLUDED.role, org_users.role),
         department = COALESCE(EXCLUDED.department, org_users.department),
         is_active = TRUE
       RETURNING id, org_id, name, email, role, department, is_active, allowed_pages, created_at`,
      [org_id, name, email, hashed, role || 'org_user', department || null, allowed_pages || null]
    );
    // Mirror into the users table: create the account if missing and append
    // this org's id to org_ids so the member can log in to it.
    const { ensureUserAccount } = require('./memberRoute');
    const user = await ensureUserAccount({ email, name, password, role: role || 'org_user', orgId: org_id });
    res.status(201).json({ user: rows[0], system_user_id: user.id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists in this org' });
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/org-users/:id
router.put('/org-users/:id', async (req, res) => {
  try {
    const { name, email, role, department, is_active, allowed_pages } = req.body;
    await centralPool.query(
      `UPDATE org_users SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         role = COALESCE($3, role),
         department = COALESCE($4, department),
         is_active = COALESCE($5, is_active),
         allowed_pages = COALESCE($6, allowed_pages),
         updated_at = NOW()
       WHERE id = $7`,
      [name, email, role, department, is_active, allowed_pages, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/org-users/:id
router.delete('/org-users/:id', async (req, res) => {
  try {
    await centralPool.query('DELETE FROM org_users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
