/**
 * Quick SMTP credential check.
 * Run:  node test-smtp.js
 * Loads backend/.env and verifies the Gmail login WITHOUT sending an email.
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) {
  console.log('✖ SMTP_USER / SMTP_PASS missing in backend/.env');
  process.exit(1);
}

console.log(`Testing login as ${user} (pass: ${pass.slice(0, 4)}****, ${pass.length} chars)`);

const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  auth: { user, pass },
});

t.verify()
  .then(() => {
    console.log('✔ SUCCESS — credentials accepted. OTP emails will send.');
    process.exit(0);
  })
  .catch((e) => {
    console.log('✖ FAILED:', e.message);
    if (String(e.message).includes('535')) {
      console.log('\nGoogle rejected the app password. Fix on the Google side:');
      console.log(' 1. Open https://myaccount.google.com/security');
      console.log(' 2. Make sure "2-Step Verification" is ON (app passwords need it)');
      console.log(' 3. Open https://myaccount.google.com/apppasswords');
      console.log(' 4. Create a new app password, copy all 16 chars WITHOUT spaces');
      console.log(' 5. Paste into SMTP_PASS in backend/.env, restart the backend');
      console.log(' 6. Re-run: node test-smtp.js');
    }
    process.exit(1);
  });
