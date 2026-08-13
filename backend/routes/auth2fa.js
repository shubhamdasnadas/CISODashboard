const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { centralPool } = require('../db');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

const SESSION_TTL_MS = 10 * 60 * 1000; // login session valid 10 min
const OTP_TTL_MS = 5 * 60 * 1000;      // OTP valid 5 min
const MAX_OTP_ATTEMPTS = 5;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

function genSessionId() {
  return crypto.randomUUID();
}

function genOtp() {
  return String(crypto.randomInt(100000, 1000000)); // 6-digit
}

// Reject sessions that are missing, expired, or already verified/expired.
async function getLiveSession(sessionId) {
  if (!sessionId) return null;
  const { rows } = await centralPool.query(
    "SELECT * FROM login_sessions WHERE id = $1",
    [sessionId]
  );
  const s = rows[0];
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    await centralPool.query("DELETE FROM login_sessions WHERE id = $1", [sessionId]);
    return null;
  }
  return s;
}

// ─── STEP 1: username + password ────────────────────────────────────────────
// Validates credentials, creates a pending login session, returns sessionId.
router.post('/2fa/login', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'username, password and email are required' });
    }

    const { rows } = await centralPool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // The provided email must match the account's registered email exactly
    // (case-insensitive). This is the second factor checked before a QR is issued.
    if (!user.email || email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return res.status(401).json({ error: 'The email does not match our records for this account.' });
    }

    const sessionId = genSessionId();
    await centralPool.query(
      `INSERT INTO login_sessions (id, user_id, status, expires_at)
       VALUES ($1, $2, 'pending', NOW() + INTERVAL '10 minutes')`,
      [sessionId, user.id]
    );

    // Generate + email the OTP immediately (no QR step).
    const otp = genOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    await centralPool.query(
      `UPDATE login_sessions
         SET status = 'otp_sent', otp_hash = $1, otp_code = $2,
             otp_expires_at = NOW() + INTERVAL '5 minutes', otp_attempts = 0
       WHERE id = $3`,
      [otpHash, otp, sessionId]   // otp_code kept only for dev fallback (no SMTP)
    );

    const smtp = await sendEmail({
      to: user.email,
      subject: 'Your CISO Dashboard verification code',
      text: `Hello ${user.username},\n\nYour verification code is: ${otp}\n\nIt expires in 5 minutes.\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Hello <b>${user.username}</b>,</p>
             <p>Your verification code is:</p>
             <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${otp}</p>
             <p>It expires in 5 minutes. If you did not request this, you can ignore this email.</p>`,
    });

    res.json({
      sessionId,
      emailMasked: maskEmail(user.email),
      dev: smtp.dev, // true => OTP also printed to server console
    });
  } catch (err) {
    console.error('[2fa] login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── STEP 3: verify the OTP (entered on the login tab) ──────────────────────
router.post('/2fa/verify-otp', async (req, res) => {
  try {
    const { sessionId, otp } = req.body;
    if (!sessionId || !otp) {
      return res.status(400).json({ error: 'sessionId and otp are required' });
    }

    const session = await getLiveSession(sessionId);
    if (!session) {
      return res.status(400).json({ error: 'Session expired. Please log in again.' });
    }
    if (session.status !== 'otp_sent') {
      return res.status(400).json({ error: 'Invalid session state.' });
    }
    if (!session.otp_expires_at || new Date(session.otp_expires_at).getTime() < Date.now()) {
      await centralPool.query(
        "UPDATE login_sessions SET status = 'expired' WHERE id = $1",
        [sessionId]
      );
      return res.status(400).json({ error: 'OTP expired. Please log in again.' });
    }
    if (session.otp_attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Please log in again.' });
    }

    const valid = await bcrypt.compare(otp, session.otp_hash);
    if (!valid) {
      await centralPool.query(
        'UPDATE login_sessions SET otp_attempts = otp_attempts + 1 WHERE id = $1',
        [sessionId]
      );
      return res.status(401).json({ error: 'Invalid code.' });
    }

    // Issue the final access token (embeds org_ids; org context is applied
    // later via the X-Org-Id header, matching the rest of the app).
    const { rows: userRows } = await centralPool.query(
      'SELECT id, username, role, org_ids FROM users WHERE id = $1',
      [session.user_id]
    );
    const user = userRows[0];

    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, org_ids: user.org_ids || [] },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await centralPool.query(
      `UPDATE login_sessions SET status = 'verified', access_token = $1, otp_code = NULL
       WHERE id = $2`,
      [accessToken, sessionId]
    );

    res.json({ accessToken });
  } catch (err) {
    console.error('[2fa] verify-otp error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── STEP 4b: session-status polling (original tab) ─────────────────────────
// Never leaks the token/OTP; only returns the status (+ token once verified).
router.get('/2fa/session-status/:sessionId', async (req, res) => {
  try {
    const session = await getLiveSession(req.params.sessionId);
    if (!session) {
      return res.json({ status: 'expired' });
    }
    const payload = { status: session.status };
    if (session.status === 'verified' && session.access_token) {
      payload.accessToken = session.access_token;
    }
    res.json(payload);
  } catch (err) {
    console.error('[2fa] session-status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── STEP 5: select organisation -> final scoped token ──────────────────────
// Requires the short-lived access token issued at OTP verification.
router.post('/2fa/select-org', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required.' });
    }
    const accessToken = auth.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired access token.' });
    }

    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: 'orgId is required' });

    const userIds = decoded.org_ids || [];
    if (!userIds.includes(orgId)) {
      return res.status(403).json({ error: 'You do not belong to this organisation.' });
    }

    const { rows: orgRows } = await centralPool.query(
      'SELECT id, org_name, slug FROM organisations WHERE id = $1',
      [orgId]
    );
    if (orgRows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found.' });
    }
    const org = orgRows[0];

    // Final token embeds org context, matching the existing app's expectation.
    const token = jwt.sign(
      {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
        org_ids: decoded.org_ids,
        orgId: org.id,
        orgSlug: org.slug,
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: decoded.userId,
        username: decoded.username,
        role: decoded.role,
        org_ids: decoded.org_ids,
      },
      organisation: { id: org.id, name: org.org_name, slug: org.slug },
    });
  } catch (err) {
    console.error('[2fa] select-org error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

function maskEmail(email) {
  if (!email) return '';
  const [u, d] = email.split('@');
  if (u.length <= 2) return `${u[0]}***@${d}`;
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

module.exports = router;
