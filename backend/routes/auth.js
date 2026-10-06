const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { centralPool } = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/auth/check-username (or /check-email)
 * Body: { email } or { identifier }
 * Returns { exists, organisations?, email, username }
 * Strictly looks up user by email address (case-insensitive)
 */
async function handleCheckEmail(req, res) {
  try {
    const identifier = (req.body.email || req.body.username || req.body.identifier || '').trim();
    if (!identifier) return res.status(400).json({ error: 'Email is required' });

    const userResult = await centralPool.query(
      'SELECT id, username, email, org_ids FROM users WHERE LOWER(email) = LOWER($1)',
      [identifier]
    );
    if (userResult.rows.length === 0) {
      return res.json({ exists: false });
    }

    const matchedUser = userResult.rows[0];
    const orgIds = matchedUser.org_ids || [];
    let organisations = [];
    if (orgIds.length > 0) {
      const orgsResult = await centralPool.query(
        'SELECT id, org_name FROM organisations WHERE id = ANY($1::int[])',
        [orgIds]
      );
      organisations = orgsResult.rows;
    }

    return res.json({
      exists: true,
      organisations,
      email: matchedUser.email,
      username: matchedUser.username,
    });
  } catch (err) {
    console.error('check-email error:', err.message, err.code || '');
    return res.status(500).json({
      error: 'Server error',
      detail: err.message,
      code: err.code || null,
    });
  }
}

router.post('/check-username', handleCheckEmail);
router.post('/check-email', handleCheckEmail);

/**
 * POST /api/auth/check-password
 * Body: { email, password }
 * Returns { valid: boolean }
 * Checks if the entered password matches the account password
 */
router.post('/check-password', async (req, res) => {
  try {
    const identifier = (req.body.email || req.body.username || req.body.identifier || '').trim();
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ valid: false, error: 'Email and password are required' });
    }

    const result = await centralPool.query(
      'SELECT password FROM users WHERE LOWER(email) = LOWER($1)',
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.json({ valid: false });
    }

    const valid = await bcrypt.compare(password, result.rows[0].password);
    return res.json({ valid: Boolean(valid) });
  } catch (err) {
    console.error('check-password error:', err);
    return res.status(500).json({ valid: false, error: 'Server error' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns { token, user } or { otpRequested: true, username, email }
 * Strictly authenticates by registered email address
 */
router.post('/login', async (req, res) => {
  try {
    const identifier = (req.body.email || req.body.username || req.body.identifier || '').trim();
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await centralPool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Password valid - now trigger OTP flow
    return res.json({
      otpRequested: true,
      username: user.username,
      email: user.email,
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

/**
 * GET /api/auth/me
 * Returns current user from JWT
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await centralPool.query(
      'SELECT id, username, role, org_ids FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/logout
 * Body: { logId?, username?, sessionId? }
 * Sets logout_time for the user's session in user_logs
 */
router.post('/logout', async (req, res) => {
  try {
    const { logId, username, sessionId } = req.body || {};
    let targetUsername = username;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        if (decoded?.username) targetUsername = decoded.username;
      } catch {}
    }

    if (logId) {
      await centralPool.query(
        'UPDATE user_logs SET logout_time = NOW() WHERE id = $1',
        [logId]
      );
    } else if (sessionId) {
      await centralPool.query(
        'UPDATE user_logs SET logout_time = NOW() WHERE session_id = $1 AND logout_time IS NULL',
        [sessionId]
      );
    } else if (targetUsername) {
      await centralPool.query(
        `UPDATE user_logs SET logout_time = NOW()
         WHERE id = (
           SELECT id FROM user_logs
           WHERE username = $1 AND logout_time IS NULL
           ORDER BY login_time DESC LIMIT 1
         )`,
        [targetUsername]
      );
    }

    return res.json({ success: true, message: 'Logout recorded' });
  } catch (err) {
    console.error('logout error:', err);
    return res.status(500).json({ error: 'Server error on logout', detail: err.message });
  }
});

/**
 * GET /api/auth/user-logs
 * Returns logs from user_logs
 */
router.get('/user-logs', authMiddleware, async (req, res) => {
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

/**
 * GET /api/auth/verify-setup-token
 * Verify whether an email password setup token is valid and unexpired
 */
router.get('/verify-setup-token', async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.status(400).json({ valid: false, error: 'Token and email parameters are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const { rows } = await centralPool.query(
      `SELECT id, username, email, role, status, password_setup_expires_at
       FROM users
       WHERE LOWER(email) = $1 AND password_setup_token = $2 AND deleted_at IS NULL`,
      [trimmedEmail, token.trim()]
    );

    if (rows.length === 0) {
      return res.status(400).json({ valid: false, error: 'This password setup link is invalid or has already been used.' });
    }

    const user = rows[0];
    if (user.password_setup_expires_at && new Date(user.password_setup_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ valid: false, error: 'This password setup link has expired. Please ask your administrator to resend an invite.' });
    }

    return res.json({
      valid: true,
      username: user.username,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    console.error('verify-setup-token error:', err);
    return res.status(500).json({ valid: false, error: 'Server error verifying setup token' });
  }
});

/**
 * POST /api/auth/setup-password
 * Activate user account and set initial password
 */
router.post('/setup-password', async (req, res) => {
  try {
    const { token, email, password } = req.body;
    if (!token || !email || !password) {
      return res.status(400).json({ error: 'Token, email, and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const { rows } = await centralPool.query(
      `SELECT id, username, email, role, status, password_setup_expires_at
       FROM users
       WHERE LOWER(email) = $1 AND password_setup_token = $2 AND deleted_at IS NULL`,
      [trimmedEmail, token.trim()]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already used password setup token.' });
    }

    const user = rows[0];
    if (user.password_setup_expires_at && new Date(user.password_setup_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This password setup link has expired. Please request a new invite link.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await centralPool.query(
      `UPDATE users SET
         password = $1,
         password_setup_token = NULL,
         password_setup_expires_at = NULL,
         is_active = TRUE,
         status = 'active',
         must_change_password = FALSE,
         updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, user.id]
    );

    return res.json({
      success: true,
      message: 'Your password has been successfully configured! You can now log in.',
      username: user.username,
    });
  } catch (err) {
    console.error('setup-password error:', err);
    return res.status(500).json({ error: 'Server error setting up password', detail: err.message });
  }
});

module.exports = router;