const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { centralPool } = require('../db');
const { sendEmail } = require('../utils/mailer');
const { validateUserAndOrgStatus } = require('../utils/userOrgValidation');

const router = express.Router();

const OTP_LENGTH = 6;
const OTP_EXPIRE_MINUTES = 5;
const OTP_HASH_SALT_ROUNDS = 10;
const RESEND_COOLDOWN_MS = 30 * 1000;

function maskEmail(email) {
  if (!email) return '';
  const [u, d] = String(email).split('@');
  if (!d) return email;
  if (u.length <= 2) return `${u[0]}***@${d}`;
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

// The most recent unexpired, unused OTP for a user (the one that actually works).
async function latestLiveOtp(userId) {
  const res = await centralPool.query(
    `SELECT * FROM user_otps
      WHERE user_id = $1 AND is_used = false AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

function generateOtp() {
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

async function storeOtp(userId, otp) {
  const hash = await bcrypt.hash(otp, OTP_HASH_SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000);
  await centralPool.query(
    'INSERT INTO user_otps(user_id, otp_hash, expires_at, is_used) VALUES ($1,$2,$3,false)',
    [userId, hash, expiresAt]
  );
}

async function verifyOtp(userId, otp) {
  // Only the most recently issued, unexpired, unused code is valid — resending
  // a newer code makes any previous codes dead.
  const res = await centralPool.query(
    'SELECT * FROM user_otps WHERE user_id=$1 AND is_used=false ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (res.rows.length === 0) return { valid: false, reason: 'expired' };
  const record = res.rows[0];
  if (new Date(record.expires_at) < new Date()) {
    // The code on screen has lapsed by now.
    return { valid: false, reason: 'expired' };
  }
  const match = await bcrypt.compare(otp, record.otp_hash);
  if (!match) return { valid: false, reason: 'invalid' };
  await centralPool.query('UPDATE user_otps SET is_used=true WHERE id=$1', [record.id]);
  return { valid: true, record };
}

function sendOtpEmail(user, otp) {
  return sendEmail({
    to: user.email,
    subject: 'Your OTP Code',
    text: `Your OTP is ${otp}. It expires in ${OTP_EXPIRE_MINUTES} minutes.`,
    html: `<p>Your OTP code is:</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${otp}</p>
           <p>It expires in ${OTP_EXPIRE_MINUTES} minutes. If you did not request this, you can ignore this email.</p>`,
  });
}

router.post('/send', async (req, res) => {
  const identifier = (req.body.email || req.body.username || req.body.identifier || '').trim();
  if (!identifier) return res.status(400).json({ error: 'Email is required' });
  const userResult = await centralPool.query(
    'SELECT id, username, email, role, org_ids, organisation_id, is_active, status FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
    [identifier]
  );
  if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userResult.rows[0];

  const statusCheck = await validateUserAndOrgStatus(user, centralPool);
  if (statusCheck.blocked) {
    return res.status(403).json({
      error: statusCheck.code,
      code: statusCheck.code,
      orgStatus: statusCheck.orgStatus || 'inactive',
      message: statusCheck.message,
      orgName: statusCheck.orgName || null,
    });
  }

  // Rate-limit re-sends: the one OTP that actually works is created_at DESC first,
  // so its age tells us when the last code was issued.
  const latest = await latestLiveOtp(user.id);
  if (latest) {
    const ageMs = Date.now() - new Date(latest.created_at).getTime();
    if (ageMs < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - ageMs) / 1000);
      return res.status(429).json({
        error: `Please wait ${wait}s before requesting another code.`,
        retryAfterSec: wait,
      });
    }
  }

  const otp = generateOtp();
  await storeOtp(user.id, otp);
  const smtp = await sendOtpEmail(user, otp);
  return res.json({
    message: 'OTP sent',
    emailMasked: maskEmail(user.email),
    email: user.email,
    username: user.username,
    dev: smtp.dev,
    otp,
    otpCode: otp,
  });
});

router.post('/verify', async (req, res) => {
  const identifier = (req.body.email || req.body.username || req.body.identifier || '').trim();
  const { otp } = req.body;
  if (!identifier || !otp) return res.status(400).json({ error: 'Email and OTP are required' });
  const userRes = await centralPool.query(
    'SELECT id, username, email, role, org_ids, organisation_id, is_active, status FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
    [identifier]
  );
  if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRes.rows[0];

  const statusCheck = await validateUserAndOrgStatus(user, centralPool);
  if (statusCheck.blocked) {
    return res.status(403).json({
      error: statusCheck.code,
      code: statusCheck.code,
      orgStatus: statusCheck.orgStatus || 'inactive',
      message: statusCheck.message,
      orgName: statusCheck.orgName || null,
    });
  }

  const verified = await verifyOtp(user.id, otp);
  // Distinguish a truly expired code (user must resend) from a wrong one.
  if (!verified.valid) {
    const message = verified.reason === 'expired'
      ? 'This code has expired. Request a new one.'
      : 'Invalid code. Check the 6-digit code and try again.';
    return res.status(401).json({ error: message });
  }

  // Update last_login_at
  try {
    await centralPool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  } catch (err) {
    console.warn('[auth/otp] Failed to update last_login_at:', err.message);
  }

  // Generate JWT token after OTP verification
  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    org_ids: user.org_ids || [],
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  // Record login in user_logs table (username, role, date, login_time)
  let logId = null;
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    const logRes = await centralPool.query(
      `INSERT INTO user_logs (username, role, date, login_time, ip_address, user_agent)
       VALUES ($1, $2, CURRENT_DATE, NOW(), $3, $4)
       RETURNING id`,
      [user.username, user.role, ip, userAgent]
    );
    logId = logRes.rows[0]?.id || null;
  } catch (logErr) {
    console.warn('[auth/otp] Failed to log user login:', logErr.message);
  }

  return res.json({
    message: 'OTP verified',
    token,
    logId,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      org_ids: user.org_ids || [],
    },
  });
});

module.exports = router;