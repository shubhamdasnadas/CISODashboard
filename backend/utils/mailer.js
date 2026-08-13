const nodemailer = require('nodemailer');

/**
 * Lazily-created, cached nodemailer transport.
 *
 * If SMTP credentials are present in the environment the transport uses them;
 * otherwise it falls back to a "dev" transport that simply logs the message
 * to the console. This lets the full 2FA flow run locally without real SMTP.
 *
 * Env vars:
 *   SMTP_HOST, SMTP_PORT (optional, default 587), SMTP_SECURE (optional),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM
 */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: String(SMTP_SECURE || 'false') === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  } else {
    // Dev fallback: print to console instead of sending.
    _transporter = {
      _dev: true,
      async sendMail(info) {
        console.log('\n────────── [mailer:dev] EMAIL (not actually sent) ──────────');
        console.log(`To:      ${info.to}`);
        console.log(`Subject: ${info.subject}`);
        console.log(`Body:\n${info.text || info.html}`);
        console.log('────────────────────────────────────────────────────────────\n');
        return { dev: true, messageId: `dev-${Date.now()}` };
      },
    };
  }

  return _transporter;
}

/**
 * Send a plain-text + html email. Returns { dev: boolean }.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to) throw new Error('sendEmail: recipient is required');
  const from = process.env.SMTP_FROM || 'CISO Dashboard <noreply@ciso.local>';

  // If no SMTP is configured (dev), just log the message and report dev mode.
  if (getTransporter()._dev) {
    console.log('\n────────── [mailer:dev] EMAIL (not actually sent) ──────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${text || html}`);
    console.log('────────────────────────────────────────────────────────────\n');
    return { dev: true, messageId: `dev-${Date.now()}` };
  }

  // Real SMTP configured: try to send, but never crash the login flow if the
  // provider rejects the credentials — fall back to logging the OTP so the
  // user (and developer) can still complete verification.
  try {
    const info = await getTransporter().sendMail({ from, to, subject, text, html });
    return { dev: false, messageId: info.messageId };
  } catch (err) {
    console.error('[mailer] SMTP send failed, falling back to console:', err.message);
    console.log('\n────────── [mailer:fallback] EMAIL (SMTP failed) ──────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${text || html}`);
    console.log('────────────────────────────────────────────────────────────\n');
    return { dev: true, messageId: `fallback-${Date.now()}`, smtpFailed: true };
  }
}

module.exports = { sendEmail };
