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
    if (req.user && req.user.userId) {
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
      'SELECT allowed_pages FROM org_users WHERE LOWER(email) = LOWER($1) AND org_id = $2 AND is_active = TRUE',
      [req.user?.email || '', orgId]
    );
    const pages = rows[0]?.allowed_pages;
    res.json({ allowed_pages: Array.isArray(pages) && pages.length > 0 ? pages : null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/member/orgs — current user's org memberships
router.get('/orgs', async (req, res) => {
  try {
    const email = req.user?.email || '';
    const userId = req.user?.userId;

    if (userId) {
      const { rows } = await centralPool.query(
        `SELECT o.id, o.org_name, o.slug, o.industry, o.plan, o.color, o.is_active,
                u.role, '' AS department, u.allowed_pages
         FROM organisations o
         JOIN users u ON o.id = ANY(COALESCE(u.org_ids, ARRAY[]::int[]))
         WHERE u.id = $1 AND o.is_active = TRUE
         ORDER BY o.id`,
        [userId]
      );
      return res.json({ orgs: rows });
    }

    const { rows } = await centralPool.query(
      `SELECT o.id, o.org_name, o.slug, o.industry, o.plan, o.color, o.is_active,
              ou.role, ou.department, ou.allowed_pages
       FROM org_users ou
       JOIN organisations o ON o.id = ou.org_id
       WHERE LOWER(ou.email) = LOWER($1) AND ou.is_active = TRUE AND o.is_active = TRUE
       ORDER BY o.id`,
      [email]
    );
    res.json({ orgs: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function canReadOrg(req, orgId) {
  const { role, org_ids } = req.user || {};
  if (role === 'superAdmin') return true;
  const targetOrg = parseInt(orgId || req.headers['x-org-id'] || req.query.orgId, 10);
  if (!targetOrg) return false;
  if (Array.isArray(org_ids) && org_ids.map(Number).includes(targetOrg)) return true;
  const xOrgId = parseInt(req.headers['x-org-id'], 10);
  return xOrgId === targetOrg && (role === 'admin' || role === 'org_admin' || role === 'member');
}

function canManageOrg(req, orgId) {
  const { role, org_ids } = req.user || {};
  if (role === 'superAdmin') return true;
  const targetOrg = parseInt(orgId || req.headers['x-org-id'] || req.query.orgId || req.body?.orgId, 10);
  if (!targetOrg) return false;
  const hasRole = role === 'admin' || role === 'org_admin';
  if (!hasRole) return false;
  if (Array.isArray(org_ids) && org_ids.map(Number).includes(targetOrg)) return true;
  const xOrgId = parseInt(req.headers['x-org-id'], 10);
  return xOrgId === targetOrg;
}

// Maps org-level roles to system-user roles in the users table.
const toSystemRole = (role) => (role === 'org_admin' || role === 'admin' ? 'admin' : 'member');
const toOrgRole = (role) => (role === 'admin' || role === 'org_admin' ? 'org_admin' : 'org_user');

/**
 * GET /api/member/members
 * Returns all valid members for the specified organisation strictly matching the central `users` database.
 * Deduplicates and synchronizes with `org_users`.
 */
router.get('/members', async (req, res) => {
  try {
    const orgId = parseInt(req.headers['x-org-id'] || req.query.orgId, 10);
    if (!orgId) return res.status(400).json({ message: 'org required' });
    if (!canReadOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });

    // 1. Clean up orphaned org_users rows where the user does not exist in users or has no org membership
    try {
      await centralPool.query(
        `DELETE FROM org_users
         WHERE org_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM users u
             WHERE ((LOWER(u.email) = LOWER(org_users.email) AND org_users.email IS NOT NULL AND org_users.email != '') OR u.username = org_users.name)
               AND $1 = ANY(COALESCE(u.org_ids, ARRAY[]::int[]))
           )`,
        [orgId]
      );
    } catch (cleanErr) {
      console.warn('[memberRoute] Cleanup warning:', cleanErr.message);
    }

    // 2. Query users belonging to this organisation with LATERAL join to guarantee no duplicate rows
    const { rows } = await centralPool.query(
      `SELECT
         u.id::text AS id,
         $1::int AS org_id,
         u.username AS name,
         COALESCE(u.email, '') AS email,
         CASE WHEN u.role = 'superAdmin' THEN 'admin' ELSE u.role END AS role,
         COALESCE(ou.department, '') AS department,
         COALESCE(ou.is_active, TRUE) AS is_active,
         COALESCE(ou.allowed_pages, u.allowed_pages) AS allowed_pages,
         COALESCE(ou.created_at, NOW()) AS created_at,
         'system_user' AS user_type
       FROM users u
       LEFT JOIN LATERAL (
         SELECT department, is_active, allowed_pages, created_at
         FROM org_users ou
         WHERE ((LOWER(ou.email) = LOWER(u.email) AND u.email IS NOT NULL AND u.email != '') OR ou.name = u.username)
           AND ou.org_id = $1
         ORDER BY ou.created_at DESC
         LIMIT 1
       ) ou ON TRUE
       WHERE $1 = ANY(COALESCE(u.org_ids, ARRAY[]::int[]))
         AND u.role != 'superAdmin'
       ORDER BY u.id ASC`,
      [orgId]
    );

    res.json({ members: rows });
  } catch (err) {
    console.error('get members error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Ensures a users-table account exists for this member
async function ensureUserAccount({ email, name, password, role, orgId, allowed_pages }) {
  const insertHash = await bcrypt.hash(
    password || require('crypto').randomBytes(24).toString('hex'),
    10
  );

  const trimmedEmail = email ? email.trim() : null;
  const sysRole = toSystemRole(role);

  // If email exists, append orgId
  if (trimmedEmail) {
    const { rows: existing } = await centralPool.query(
      'SELECT id, username, org_ids, allowed_pages FROM users WHERE LOWER(email) = LOWER($1)',
      [trimmedEmail]
    );
    if (existing[0]) {
      await centralPool.query(
        `UPDATE users
         SET org_ids = CASE WHEN $1::int = ANY(COALESCE(org_ids, ARRAY[]::int[]))
                            THEN org_ids
                            ELSE array_append(COALESCE(org_ids, ARRAY[]::int[]), $1::int) END,
             role = COALESCE($2, role),
             allowed_pages = COALESCE($3, allowed_pages)
         WHERE id = $4`,
        [orgId, sysRole, allowed_pages || null, existing[0].id]
      );
      return existing[0];
    }
  }

  // New account: create unique username
  const base = (name || '').trim() || (trimmedEmail ? trimmedEmail.split('@')[0] : 'user');
  let username = base;
  for (let i = 1; ; i++) {
    const { rows: dupe } = await centralPool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (!dupe.length) break;
    username = `${base}${i}`;
  }

  const { rows } = await centralPool.query(
    `INSERT INTO users (username, password, role, email, org_ids, allowed_pages)
     VALUES ($1, $2, $3, $4, ARRAY[$5::int], $6)
     RETURNING id, username, email, role, org_ids, allowed_pages`,
    [username, insertHash, sysRole, trimmedEmail, orgId, allowed_pages || null]
  );
  return rows[0];
}

/**
 * POST /api/member/members — add a member to the current organisation
 */
router.post('/members', async (req, res) => {
  try {
    const orgId = parseInt(req.headers['x-org-id'] || req.body.orgId, 10);
    if (!orgId) return res.status(400).json({ message: 'org required' });
    if (!canManageOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });

    const { name, email, password, role = 'member', department, allowed_pages } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Name and email are required' });

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const hashed = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('Password@123', 10);

    // 1. Create or link user in central `users` table
    const user = await ensureUserAccount({
      email: trimmedEmail,
      name: trimmedName,
      password,
      role,
      orgId,
      allowed_pages: Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : null,
    });

    // 2. Sync to `org_users`
    const { rows } = await centralPool.query(
      `INSERT INTO org_users (org_id, name, email, password, role, department, is_active, allowed_pages)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
       ON CONFLICT (email, org_id) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         department = COALESCE(EXCLUDED.department, org_users.department),
         is_active = TRUE,
         allowed_pages = EXCLUDED.allowed_pages,
         updated_at = NOW()
       RETURNING id, org_id, name, email, role, department, is_active, allowed_pages, created_at`,
      [
        orgId,
        trimmedName,
        trimmedEmail,
        hashed,
        toOrgRole(role),
        department || null,
        Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : null,
      ]
    );

    res.status(201).json({
      member: {
        ...rows[0],
        id: String(user.id),
        user_type: 'system_user',
      },
      user_id: user.id,
    });
  } catch (err) {
    console.error('add member error:', err);
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists in this org' });
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/member/members/:id — update a member's details, role, department, page access, or status
 */
router.put('/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = parseInt(req.headers['x-org-id'] || req.body.orgId, 10);
    if (!canManageOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });

    const { name, email, password, role, department, is_active, allowed_pages } = req.body;
    const numericId = parseInt(id, 10);

    let targetUser = null;
    if (!isNaN(numericId)) {
      const { rows } = await centralPool.query('SELECT * FROM users WHERE id = $1', [numericId]);
      targetUser = rows[0] || null;
    }

    const currentEmail = targetUser?.email || email;
    let passwordHash = null;
    if (password && String(password).trim()) {
      passwordHash = await bcrypt.hash(String(password).trim(), 10);
    }

    // 1. Update `users` table if numeric ID matched or email matched
    if (targetUser) {
      await centralPool.query(
        `UPDATE users SET
           username      = COALESCE($1, username),
           email         = COALESCE($2, email),
           role          = COALESCE($3, role),
           password      = COALESCE($4, password),
           allowed_pages = $5
         WHERE id = $6`,
        [
          name ? name.trim() : null,
          email ? email.trim() : null,
          role ? toSystemRole(role) : null,
          passwordHash,
          allowed_pages !== undefined ? (Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : null) : targetUser.allowed_pages,
          targetUser.id,
        ]
      );
    }

    // 2. Update or insert in `org_users`
    if (currentEmail) {
      await centralPool.query(
        `INSERT INTO org_users (org_id, name, email, role, department, is_active, allowed_pages)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE), $7)
         ON CONFLICT (email, org_id) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, org_users.name),
           role = COALESCE(EXCLUDED.role, org_users.role),
           department = COALESCE(EXCLUDED.department, org_users.department),
           is_active = COALESCE(EXCLUDED.is_active, org_users.is_active),
           allowed_pages = EXCLUDED.allowed_pages,
           updated_at = NOW()`,
        [
          orgId,
          name || targetUser?.username || 'User',
          currentEmail,
          role ? toOrgRole(role) : 'member',
          department || null,
          is_active !== undefined ? is_active : null,
          allowed_pages !== undefined ? (Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : null) : null,
        ]
      );
    }

    return res.json({
      success: true,
      member: {
        id: String(targetUser ? targetUser.id : id),
        org_id: orgId,
        name: name || targetUser?.username,
        email: currentEmail,
        role: role ? toOrgRole(role) : targetUser?.role,
        department: department || '',
        is_active: is_active !== undefined ? is_active : true,
        allowed_pages: allowed_pages || null,
        user_type: 'system_user',
      },
    });
  } catch (err) {
    console.error('update member error:', err);
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists in this org' });
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/member/members/:id — remove member from the organisation
 */
router.delete('/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = parseInt(req.headers['x-org-id'] || req.query.orgId || req.body?.orgId, 10);
    if (!orgId) return res.status(400).json({ message: 'org required' });
    if (!canManageOrg(req, orgId)) return res.status(403).json({ message: 'Access denied' });

    const numericId = parseInt(id, 10);

    if (!isNaN(numericId)) {
      // 1. Fetch user to check email and remaining orgs
      const { rows } = await centralPool.query('SELECT id, username, email, org_ids, role FROM users WHERE id = $1', [numericId]);
      if (rows[0]) {
        const user = rows[0];
        const userEmail = user.email ? user.email.trim() : null;
        const userName = user.username ? user.username.trim() : null;

        // Remove orgId from user's org_ids
        const updatedOrgIds = (user.org_ids || []).map(Number).filter((o) => o !== orgId);

        // Delete from org_users for this organization
        if (userEmail) {
          await centralPool.query(
            'DELETE FROM org_users WHERE org_id = $1 AND (LOWER(email) = LOWER($2) OR name = $3)',
            [orgId, userEmail, userName]
          );
        } else if (userName) {
          await centralPool.query('DELETE FROM org_users WHERE org_id = $1 AND name = $2', [orgId, userName]);
        }

        if (updatedOrgIds.length === 0 && user.role !== 'superAdmin') {
          // No remaining orgs -> delete user and associated OTP records
          await centralPool.query('DELETE FROM user_otps WHERE user_id = $1', [user.id]).catch(() => {});
          await centralPool.query('DELETE FROM users WHERE id = $1', [user.id]);
        } else {
          await centralPool.query('UPDATE users SET org_ids = $1 WHERE id = $2', [updatedOrgIds, user.id]);
        }

        return res.json({ success: true, message: 'Member removed from organisation successfully' });
      }
    }

    // Fallback: delete from org_users if id is a UUID or non-numeric
    const { rows: ouRows } = await centralPool.query(
      'SELECT email, name FROM org_users WHERE id::text = $1 AND org_id = $2',
      [id, orgId]
    );
    if (ouRows[0]) {
      const ou = ouRows[0];
      await centralPool.query('DELETE FROM org_users WHERE id::text = $1 AND org_id = $2', [id, orgId]);
      if (ou.email || ou.name) {
        const { rows: uRows } = await centralPool.query(
          'SELECT id, org_ids, role FROM users WHERE (LOWER(email) = LOWER($1) AND $1 != \'\') OR username = $2',
          [ou.email || '', ou.name || '']
        );
        for (const u of uRows) {
          const updated = (u.org_ids || []).map(Number).filter((o) => o !== orgId);
          if (updated.length === 0 && u.role !== 'superAdmin') {
            await centralPool.query('DELETE FROM user_otps WHERE user_id = $1', [u.id]).catch(() => {});
            await centralPool.query('DELETE FROM users WHERE id = $1', [u.id]);
          } else {
            await centralPool.query('UPDATE users SET org_ids = $1 WHERE id = $2', [updated, u.id]);
          }
        }
      }
    } else {
      await centralPool.query('DELETE FROM org_users WHERE id::text = $1 AND org_id = $2', [id, orgId]);
    }

    return res.json({ success: true, message: 'Member removed from organisation successfully' });
  } catch (err) {
    console.error('delete member error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.ensureUserAccount = ensureUserAccount;
