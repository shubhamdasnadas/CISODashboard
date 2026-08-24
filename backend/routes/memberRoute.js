const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { centralPool } = require('../db');

// GET /api/member/my-access — page access for the CURRENT user + org.
// Returns { allowed_pages: null } when everything is allowed.
router.get('/my-access', async (req, res) => {
  try {
    const orgId = parseInt(req.headers['x-org-id'], 10);
    if (!orgId) return res.status(400).json({ message: 'org required' });

    // System user (users table)
    if (req.user.userId) {
      const { rows } = await centralPool.query(
        'SELECT allowed_pages FROM users WHERE id = $1 AND $2 = ANY(COALESCE(org_ids, ARRAY[]::int[]))',
        [req.user.userId, orgId]
      );
      if (rows[0]) {
        const pages = rows[0].allowed_pages;
        return res.json({ allowed_pages: Array.isArray(pages) && pages.length > 0 ? pages : null });
      }
      return res.json({ allowed_pages: null });
    }

    // Org-level user (org_users table)
    const { rows } = await centralPool.query(
      'SELECT allowed_pages FROM org_users WHERE email = $1 AND org_id = $2 AND is_active = TRUE',
      [req.user.email || '', orgId]
    );
    const pages = rows[0]?.allowed_pages;
    res.json({ allowed_pages: Array.isArray(pages) && pages.length > 0 ? pages : null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/member/orgs  — current user's org memberships (from org_users table)
router.get('/orgs', async (req, res) => {
  try {
    const { rows } = await centralPool.query(
      `SELECT o.id, o.org_name, o.slug, o.industry, o.plan, o.color, o.is_active,
              ou.role, ou.department, ou.allowed_pages
       FROM org_users ou
       JOIN organisations o ON o.id = ou.org_id
       WHERE ou.email = $1 AND ou.is_active = TRUE AND o.is_active = TRUE
       ORDER BY o.id`,
      [req.user.email || '']
    );
    res.json({ orgs: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function canReadOrg(req, orgId) {
  const { role, org_ids } = req.user;
  if (role === 'superAdmin') return true;
  const xOrgId = parseInt(req.headers['x-org-id'], 10);
  if (xOrgId !== parseInt(orgId, 10)) return false;
  // Any authenticated user belonging to this org can read members
  if (Array.isArray(org_ids) && org_ids.includes(xOrgId)) return true;
  return role === 'admin' || role === 'org_admin' || role === 'member';
}

function canManageOrg(req, orgId) {
  const { role } = req.user;
  if (role === 'superAdmin') return true;
  const xOrgId = parseInt(req.headers['x-org-id'], 10);
  return xOrgId === parseInt(orgId, 10) && (role === 'admin' || role === 'org_admin');
}

// GET /api/member/members — list org members (org_users + system users from users table)
router.get('/members', async (req, res) => {
  try {
    const orgId = parseInt(req.headers['x-org-id'] || req.query.orgId, 10);
    if (!orgId) return res.status(400).json({ message: 'org required' });
    if (!canReadOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });
    const { rows } = await centralPool.query(
      `SELECT id::text, org_id, name, email, role, department, is_active,
              allowed_pages, created_at, 'org_user' AS user_type
       FROM org_users WHERE org_id = $1
       UNION ALL
       SELECT id::text, $1::int AS org_id, username AS name,
              COALESCE(email, '') AS email, role, '' AS department, TRUE AS is_active,
              allowed_pages,
              '1970-01-01'::timestamptz AS created_at, 'system_user' AS user_type
       FROM users
       WHERE $1 = ANY(COALESCE(org_ids, ARRAY[]::int[])) AND role != 'superAdmin'
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ members: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Maps org-level roles to system-user roles in the users table.
const toSystemRole = (role) => (role === 'org_admin' ? 'admin' : 'member');

// Ensures a users-table account exists for this member and that the given
// org id is present in its org_ids array. The username comes from the
// member's NAME (matching seeded accounts like Radhesh/Shubham); email is
// kept separately as the identity used to link multi-org memberships.
// Called by Add Member and Add to Org.
async function ensureUserAccount({ email, name, password, role, orgId }) {
  // Unusable random hash when no password given — new accounts can't be
  // logged into until a real password is set.
  const insertHash = await bcrypt.hash(
    password || require('crypto').randomBytes(24).toString('hex'), 10);

  // Identity = email. Account already exists? Just append this org to org_ids.
  const { rows: existing } = await centralPool.query(
    'SELECT id, username, org_ids FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  if (existing[0]) {
    await centralPool.query(
      `UPDATE users SET org_ids = CASE WHEN $1::int = ANY(org_ids)
                                       THEN org_ids
                                       ELSE array_append(org_ids, $1::int) END
       WHERE id = $2`,
      [orgId, existing[0].id]
    );
    return existing[0];
  }

  // New account: username from the member's name, made unique if taken
  // ("Test Member" -> "Test Member1", "Test Member2", …).
  const base = (name || '').trim() || email.split('@')[0];
  let username = base;
  for (let i = 1; ; i++) {
    const { rows: dupe } = await centralPool.query(
      'SELECT 1 FROM users WHERE username = $1', [username]);
    if (!dupe.length) break;
    username = `${base}${i}`;
  }

  const { rows } = await centralPool.query(
    `INSERT INTO users (username, password, role, email, org_ids)
     VALUES ($1, $2, $3, $4, ARRAY[$5::int])
     RETURNING id`,
    [username, insertHash, toSystemRole(role), email, orgId]
  );
  return rows[0];
}

// POST /api/member/members — add member
router.post('/members', async (req, res) => {
  try {
    const orgId = parseInt(req.headers['x-org-id'] || req.body.orgId, 10);
    if (!orgId) return res.status(400).json({ message: 'org required' });
    if (!canManageOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });
    const { name, email, password, role = 'org_user', department } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'name and email are required' });
    const hashed = password ? await bcrypt.hash(password, 10) : null;
    const { rows } = await centralPool.query(
      `INSERT INTO org_users (org_id, name, email, password, role, department, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id, org_id, name, email, role, department, is_active, created_at`,
      [orgId, name, email, hashed, role, department || null]
    );
    // Mirror into the users table so the new member gets a real login account
    // (username = email) scoped to this org via org_ids.
    const user = await ensureUserAccount({ email, name, password, role, orgId });
    res.status(201).json({ member: rows[0], user_id: user.id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists in this org' });
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/member/members/:id — updates org_users rows AND system users.
// The client tells us which table the member lives in via user_type.
router.put('/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = parseInt(req.headers['x-org-id'] || req.body.orgId, 10);
    if (!canManageOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });
    const { user_type, name, email, role, department, is_active, allowed_pages } = req.body;

    if (user_type === 'system_user') {
      // System users live in the users table; only fields that exist there.
      // allowed_pages: NULL = all pages allowed; array = only these keys.
      if (name === undefined && email === undefined && allowed_pages === undefined) {
        return res.status(400).json({ message: 'nothing to update' });
      }
      const { rows } = await centralPool.query(
        `UPDATE users SET
           username      = COALESCE($1, username),
           email         = COALESCE($2, email),
           allowed_pages = $3
         WHERE id = $4 AND $5 = ANY(COALESCE(org_ids, ARRAY[]::int[]))
         RETURNING id, username AS name, email, role, allowed_pages`,
        [name || null, email || null,
         Array.isArray(allowed_pages) ? allowed_pages : null,
         id, orgId]
      );
      if (!rows[0]) return res.status(404).json({ message: 'Member not found' });
      return res.json({ member: { ...rows[0], user_type: 'system_user' } });
    }

    // org_users row — normal path
    const { rows } = await centralPool.query(
      `UPDATE org_users SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         role = COALESCE($3, role),
         department = COALESCE($4, department),
         is_active = COALESCE($5, is_active),
         allowed_pages = COALESCE($6, allowed_pages),
         updated_at = NOW()
       WHERE id = $7 AND org_id = $8
       RETURNING id, name, email, role, department, is_active, allowed_pages, created_at`,
      [name || null, email || null, role || null, department || null,
       is_active !== undefined ? is_active : null,
       allowed_pages || null, id, orgId]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Member not found' });
    res.json({ member: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists in this org' });
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/member/members/:id — soft delete for org_users; for system users
// removes just this org from their org_ids array.
router.delete('/members/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.headers['x-org-id'] || req.query.orgId, 10);
    if (!canManageOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });
    const { user_type } = req.query;

    if (user_type === 'system_user') {
      await centralPool.query(
        'UPDATE users SET org_ids = array_remove(org_ids, $1) WHERE id = $2',
        [orgId, req.params.id]
      );
      return res.json({ success: true });
    }

    await centralPool.query(
      'UPDATE org_users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND org_id = $2',
      [req.params.id, orgId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.ensureUserAccount = ensureUserAccount;
