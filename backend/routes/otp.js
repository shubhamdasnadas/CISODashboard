const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { centralPool } = require('../db');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

const OTP_LENGTH = 6;
const OTP_EXPIRE_MINUTES = 5;
const OTP_HASH_SALT_ROUNDS = 10;

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
  const res = await centralPool.query(
    'SELECT * FROM user_otps WHERE user_id=$1 AND is_used=false ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (res.rows.length === 0) return false;
  const record = res.rows[0];
  if (new Date(record.expires_at) < new Date()) return false;
  const match = await bcrypt.compare(otp, record.otp_hash);
  if (!match) return false;
  await centralPool.query('UPDATE user_otps SET is_used=true WHERE id=$1', [record.id]);
  return true;
}

router.post('/send', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  const userResult = await centralPool.query('SELECT id, email FROM users WHERE username=$1', [username]);
  if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userResult.rows[0];
  const otp = generateOtp();
  await storeOtp(user.id, otp);
  await sendEmail({
    to: user.email,
    subject: 'Your OTP Code',
    text: `Your OTP is ${otp}. It expires in ${OTP_EXPIRE_MINUTES} minutes.`,
  });
  return res.json({ message: 'OTP sent' });
});

router.post('/verify', async (req, res) => {
  const { username, otp } = req.body;
  if (!username || !otp) return res.status(400).json({ error: 'username and otp required' });
  const userRes = await centralPool.query('SELECT id, username, role, org_ids FROM users WHERE username=$1', [username]);
  if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRes.rows[0];
  const verified = await verifyOtp(user.id, otp);
  if (!verified) return res.status(401).json({ error: 'Invalid or expired OTP' });

  // Generate JWT token after OTP verification
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    org_ids: user.org_ids || [],
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  return res.json({
    message: 'OTP verified',
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      org_ids: user.org_ids || [],
    },
  });
});

module.exports = router;