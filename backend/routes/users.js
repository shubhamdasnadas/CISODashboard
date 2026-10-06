const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { centralPool } = require('../db');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const { sendUserInviteEmail } = require('../utils/mailer');

const router = express.Router();

/**
 * GET /api/users
 * superAdmin only — returns all users with their email, phone_number, role, status, org_ids, allowed_pages, and organisations
 */
router.get('/', authMiddleware, requireSuperAdmin, async (_req, res) => {
  try {
    const result = await centralPool.query(
      `SELECT u.id, u.username, u.email, u.phone_number, u.role, u.is_active, u.status,
              (u.status = 'pending' OR u.password_setup_token IS NOT NULL) AS is_pending_setup,
              u.org_ids, u.allowed_pages,
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
 * superAdmin only — add a new user with password setup invitation email flow
 * Body: { username, email, phone_number, password, role, org_ids: number[], allowed_pages: string[], send_invite: boolean }
 */
router.post('/', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { username, email, phone_number, password, role, org_ids, allowed_pages, confirmPassword, send_invite = true } = req.body;
    if (!username || !role) {
      return res.status(400).json({ error: 'Username and role are required' });
    }
    if (!['superAdmin', 'admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'role must be superAdmin, admin or member' });
    }

    if (confirmPassword) {
      const adminRes = await centralPool.query('SELECT password FROM users WHERE id = $1', [req.user.userId]);
      if (adminRes.rows.length === 0) return res.status(401).json({ error: 'Authorizing admin not found' });
      const isValid = await bcrypt.compare(confirmPassword, adminRes.rows[0].password);
      if (!isValid) return res.status(401).json({ error: 'Incorrect authorization password' });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email ? email.trim().toLowerCase() : null;
    const trimmedPhone = phone_number ? String(phone_number).trim() : null;
    const parsedOrgIds = Array.isArray(org_ids)
      ? org_ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n))
      : [];
    const parsedAllowedPages = Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : null;

    let token = null;
    let expiresAt = null;
    let status = 'active';
    let isActive = true;
    let hashed = '';

    if (password && String(password).trim()) {
      hashed = await bcrypt.hash(String(password).trim(), 10);
    } else {
      // Invite flow (password setup required)
      token = crypto.randomBytes(32).toString('hex');
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      hashed = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      status = 'pending';
      isActive = false;
    }

    const result = await centralPool.query(
      `INSERT INTO users (
         username, password, role, email, phone_number, org_ids, allowed_pages,
         is_active, status, password_setup_token, password_setup_expires_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING id, username, email, phone_number, role, org_ids, allowed_pages, is_active, status, password_setup_token, created_at`,
      [
        trimmedUsername,
        hashed,
        role,
        trimmedEmail,
        trimmedPhone,
        parsedOrgIds,
        parsedAllowedPages,
        isActive,
        status,
        token,
        expiresAt,
      ]
    );

    const newUser = result.rows[0];

    // Sync into org_users table if email and org_ids are provided
    if (trimmedEmail && parsedOrgIds.length > 0) {
      for (const orgId of parsedOrgIds) {
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
              trimmedUsername,
              trimmedEmail,
              hashed,
              role === 'admin' ? 'org_admin' : 'org_user',
              isActive,
              parsedAllowedPages,
            ]
          );
        } catch (orgErr) {
          console.warn(`[users] Could not sync org_user for org ${orgId}:`, orgErr.message);
        }
      }
    }

    // Send invitation email if pending setup
    if (status === 'pending' && trimmedEmail && token) {
      let orgName = null;
      if (parsedOrgIds.length > 0) {
        const orgRes = await centralPool.query('SELECT org_name FROM organisations WHERE id = $1', [parsedOrgIds[0]]);
        orgName = orgRes.rows[0]?.org_name || null;
      }
      try {
        await sendUserInviteEmail({
          to: trimmedEmail,
          name: trimmedUsername,
          phone: trimmedPhone,
          token,
          invitedBy: req.user?.username || 'SuperAdmin',
          role,
          orgName,
        });
      } catch (mailErr) {
        console.error('[users] Error sending user invite email:', mailErr.message);
      }
    }

    return res.status(201).json({
      user: newUser,
      message: status === 'pending'
        ? `User "${trimmedUsername}" created with status Pending. Invitation email sent to ${trimmedEmail}.`
        : 'User created successfully.',
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    console.error('create user error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

/**
 * POST /api/users/:id/resend-invite
 * Resend password setup invitation email
 */
router.post('/:id/resend-invite', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await centralPool.query(
      'SELECT id, username, email, phone_number, role, org_ids FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    if (!user.email) {
      return res.status(400).json({ error: 'User does not have an email address' });
    }

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
      [token, expiresAt, id]
    );

    let orgName = null;
    if (user.org_ids && user.org_ids.length > 0) {
      const orgRes = await centralPool.query('SELECT org_name FROM organisations WHERE id = $1', [user.org_ids[0]]);
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
    });

    return res.json({
      success: true,
      message: `Password setup invitation email resent to ${user.email}.`,
    });
  } catch (err) {
    console.error('resend user invite error:', err);
    return res.status(500).json({ error: 'Failed to resend invite', detail: err.message });
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

    const { username, email, phone_number, password, role, org_ids, allowed_pages } = req.body;

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
    const newPhone = phone_number !== undefined ? (phone_number ? String(phone_number).trim() : null) : current.phone_number;
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
           phone_number = $5,
           org_ids = $6,
           allowed_pages = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, username, email, phone_number, role, org_ids, allowed_pages, is_active, status`,
      [newUsername, hashed, newRole, newEmail, newPhone, newOrgIds, newAllowedPages, id]
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

/**
 * GET /api/users/logs
 * Returns user login/logout records from user_logs
 */
router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const { username, role, date, limit = 100 } = req.query;
    let query = 'SELECT id, username, role, date, login_time, logout_time, ip_address, user_agent, created_at FROM user_logs';
    const conditions = [];
    const params = [];

    if (username) {
      params.push(username);
      conditions.push(`username = $${params.length}`);
    }
    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`date = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    params.push(Math.min(parseInt(limit, 10) || 100, 500));
    query += ` ORDER BY login_time DESC LIMIT $${params.length}`;

    const { rows } = await centralPool.query(query, params);
    return res.json({ logs: rows });
  } catch (err) {
    console.error('get user_logs error:', err);
    return res.status(500).json({ error: 'Server error fetching user logs', detail: err.message });
  }
});

module.exports = router;
