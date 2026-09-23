const express = require('express');
const bcrypt = require('bcrypt');
const { centralPool } = require('../db');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * GET /api/users
 * superAdmin only — returns all users with their email, role, org_ids, allowed_pages, and organisations
 */
router.get('/', authMiddleware, requireSuperAdmin, async (_req, res) => {
  try {
    const result = await centralPool.query(
      `SELECT u.id, u.username, u.email, u.role, u.org_ids, u.allowed_pages,
              COALESCE(
                (SELECT array_agg(json_build_object('id', o.id, 'org_name', o.org_name))
                   FROM organisations o WHERE o.id = ANY(u.org_ids)),
                ARRAY[]::json[]
              ) AS organisations
         FROM users u
         ORDER BY u.id ASC`
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('list users error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

/**
 * POST /api/users
 * superAdmin only — add a new user
 * Body: { username, email, password, role, org_ids: number[], allowed_pages: string[] }
 */
router.post('/', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { username, email, password, role, org_ids, allowed_pages } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'username, password, role are required' });
    }
    if (!['superAdmin', 'admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'role must be superAdmin, admin or member' });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email ? email.trim() : null;
    const parsedOrgIds = Array.isArray(org_ids)
      ? org_ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n))
      : [];
    const parsedAllowedPages = Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : null;

    const hashed = await bcrypt.hash(password, 10);
    const result = await centralPool.query(
      `INSERT INTO users (username, password, role, email, org_ids, allowed_pages)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, role, org_ids, allowed_pages`,
      [trimmedUsername, hashed, role, trimmedEmail, parsedOrgIds, parsedAllowedPages]
    );

    const newUser = result.rows[0];

    // Sync into org_users table if email and org_ids are provided
    if (trimmedEmail && parsedOrgIds.length > 0) {
      for (const orgId of parsedOrgIds) {
        try {
          await centralPool.query(
            `INSERT INTO org_users (org_id, name, email, password, role, is_active, allowed_pages)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6)
             ON CONFLICT (email, org_id) DO UPDATE SET
               name = EXCLUDED.name,
               role = EXCLUDED.role,
               is_active = TRUE,
               allowed_pages = EXCLUDED.allowed_pages,
               updated_at = NOW()`,
            [
              orgId,
              trimmedUsername,
              trimmedEmail,
              hashed,
              role === 'admin' ? 'org_admin' : 'org_user',
              parsedAllowedPages,
            ]
          );
        } catch (orgErr) {
          console.warn(`[users] Could not sync org_user for org ${orgId}:`, orgErr.message);
        }
      }
    }

    return res.status(201).json({ user: newUser });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    console.error('create user error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

/**
 * PUT /api/users/:id
 * superAdmin only — update user details, role, email, password, organisations, and page permissions
 */
router.put('/:id', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

    const { username, email, password, role, org_ids, allowed_pages } = req.body;

    // Check existing
    const existing = await centralPool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const current = existing.rows[0];

    let hashed = current.password;
    if (password && String(password).trim()) {
      hashed = await bcrypt.hash(String(password).trim(), 10);
    }

    const newUsername = username ? username.trim() : current.username;
    const newEmail = email !== undefined ? (email ? email.trim() : null) : current.email;
    const newRole = role && ['superAdmin', 'admin', 'member'].includes(role) ? role : current.role;
    const newOrgIds = org_ids !== undefined
      ? (Array.isArray(org_ids) ? org_ids.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n)) : [])
      : (current.org_ids || []);
    const newAllowedPages = allowed_pages !== undefined
      ? (Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : null)
      : current.allowed_pages;

    const result = await centralPool.query(
      `UPDATE users
       SET username = $1,
           password = $2,
           role = $3,
           email = $4,
           org_ids = $5,
           allowed_pages = $6
       WHERE id = $7
       RETURNING id, username, email, role, org_ids, allowed_pages`,
      [newUsername, hashed, newRole, newEmail, newOrgIds, newAllowedPages, id]
    );

    // Sync org_users if email is present
    if (newEmail) {
      // 1. Remove memberships for orgs that are no longer assigned
      try {
        if (newOrgIds.length > 0) {
          await centralPool.query(
            'DELETE FROM org_users WHERE LOWER(email) = LOWER($1) AND org_id != ALL($2::int[])',
            [newEmail, newOrgIds]
          );
        } else {
          await centralPool.query(
            'DELETE FROM org_users WHERE LOWER(email) = LOWER($1)',
            [newEmail]
          );
        }
      } catch (delErr) {
        console.warn('[users] Cleanup old org_users error:', delErr.message);
      }

      // 2. Insert/update assigned org memberships
      for (const orgId of newOrgIds) {
        try {
          await centralPool.query(
            `INSERT INTO org_users (org_id, name, email, password, role, is_active, allowed_pages)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6)
             ON CONFLICT (email, org_id) DO UPDATE SET
               name = EXCLUDED.name,
               role = EXCLUDED.role,
               is_active = TRUE,
               allowed_pages = EXCLUDED.allowed_pages,
               updated_at = NOW()`,
            [
              orgId,
              newUsername,
              newEmail,
              hashed,
              newRole === 'admin' ? 'org_admin' : 'org_user',
              newAllowedPages,
            ]
          );
        } catch (orgErr) {
          console.warn(`[users] Could not update org_user for org ${orgId}:`, orgErr.message);
        }
      }
    }

    return res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    console.error('update user error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

/**
 * DELETE /api/users/:id
 * superAdmin only — delete user account, associated OTPs, and sync org memberships
 */
router.delete('/:id', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

    // Prevent superAdmin from deleting their own currently logged-in account
    if (req.user && req.user.userId === id) {
      return res.status(400).json({ error: 'You cannot delete your own active account' });
    }

    const userRes = await centralPool.query('SELECT id, email, username FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    // Clean up user_otps
    try {
      await centralPool.query('DELETE FROM user_otps WHERE user_id = $1', [id]);
    } catch (otpErr) {
      console.warn('[users] delete user_otps warning:', otpErr.message);
    }

    // Clean up org_users associated with this user email
    if (user.email) {
      try {
        await centralPool.query('DELETE FROM org_users WHERE LOWER(email) = LOWER($1)', [user.email]);
      } catch (orgUserErr) {
        console.warn('[users] delete org_users warning:', orgUserErr.message);
      }
    }

    // Delete user from users table
    await centralPool.query('DELETE FROM users WHERE id = $1', [id]);

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('delete user error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

module.exports = router;
