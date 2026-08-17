const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { centralPool } = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/auth/check-username
 * Body: { username }
 * Returns { exists, organisations? }
 */
router.post('/check-username', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const userResult = await centralPool.query('SELECT id, org_ids FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.json({ exists: false });
    }

    const orgIds = userResult.rows[0].org_ids || [];
    let organisations = [];
    if (orgIds.length > 0) {
      const orgsResult = await centralPool.query(
        'SELECT id, org_name FROM organisations WHERE id = ANY($1::int[])',
        [orgIds]
      );
      organisations = orgsResult.rows;
    }

    return res.json({ exists: true, organisations });
  } catch (err) {
    console.error('check-username error:', err.message, err.code || '');
    // Surface the actual reason so the frontend can show it instead of a
    // generic message — invaluable when diagnosing connection / auth issues.
    return res.status(500).json({
      error: 'Server error',
      detail: err.message,
      code: err.code || null,
    });
  }
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns { token, user } or { otpRequested: true, username }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const result = await centralPool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Password valid - now trigger OTP flow
    // We just return that OTP is required; the frontend will call /api/auth/otp/send
    return res.json({ otpRequested: true, username });
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

module.exports = router;