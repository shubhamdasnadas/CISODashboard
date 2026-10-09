const nodemailer = require('nodemailer');
const { getAppUrl } = require('./networkIp');

/**
 * Lazily-created, cached nodemailer transport.
 *
 * If SMTP credentials are present in the environment the transport uses them;
 * otherwise it falls back to a "dev" transport that simply logs the message
 * to the console. This lets the full 2FA flow run locally without real SMTP.
 *
 * Env vars:
 *   SMTP_ENABLED (optional, default true) — master switch. Set to "false" to
 *     force the dev-console mailer even if credentials are present.
 *   SMTP_HOST, SMTP_PORT (optional, default 587), SMTP_SECURE (optional),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM
 */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const {
    SMTP_ENABLED,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;

  // Master switch: only build a real transport when SMTP is explicitly enabled
  // AND all credentials are present. Otherwise fall back to the dev mailer.
  const enabled = String(SMTP_ENABLED || 'true') !== 'false';
  if (enabled && SMTP_HOST && SMTP_USER && SMTP_PASS) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: String(SMTP_SECURE || 'false') === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: {
        // Local Windows/dev networks can inject a self-signed certificate in the
        // SMTP chain. Keep verification enabled by default, but allow disabling
        // it from .env so Gmail OTP sending works in this environment.
        rejectUnauthorized: String(process.env.SMTP_REJECT_UNAUTHORIZED || 'true') === 'true',
      },
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

/**
 * Send a branded SuperAdmin Password Setup Invitation Email (Image #23 style).
 */
async function sendSuperAdminInviteEmail({ to, name, phone, token, invitedBy, req, appUrl }) {
  const baseUrl = appUrl || getAppUrl(req);
  const setupUrl = `${baseUrl}/setpassword?token=${encodeURIComponent(token)}&email=${encodeURIComponent(to)}`;

  const subject = 'Action Required: Set up your CISO Dashboard SuperAdmin Password';

  const text = `Hello ${name || 'SuperAdmin'},\n\nYou have been invited to join CISO Dashboard as a SuperAdmin with full platform access.\n\nPlease set up your account password by visiting the following link (valid for 24 hours):\n${setupUrl}\n\nAccount Email: ${to}\nRole: SuperAdmin\nInvited By: ${invitedBy || 'Security Admin'}\n\nIf you did not expect this invitation, please contact your security administrator.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SuperAdmin Password Setup</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f4f6;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19;padding:40px 15px;">
    <tr>
      <td align="center">
        <!-- Email Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#111827;border-radius:18px;border:1px solid #374151;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);">

          <!-- Header Banner -->
          <tr>
            <td style="padding:32px 36px;background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;line-height:56px;background-color:rgba(255,255,255,0.15);border-radius:14px;font-size:28px;margin-bottom:12px;">
                🛡️
              </div>
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                CISO DASHBOARD
              </h1>
              <span style="display:inline-block;margin-top:6px;padding:3px 12px;background-color:rgba(0,0,0,0.25);border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;color:#e0e7ff;text-transform:uppercase;">
                Enterprise Security Access
              </span>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:36px 36px 28px 36px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#f9fafb;">
                SuperAdmin Account Invitation
              </h2>

              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                Hello <strong style="color:#ffffff;">${name || 'SuperAdmin'}</strong>,
              </p>

              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                You have been granted <strong style="color:#a5b4fc;">SuperAdmin (Full Platform Access)</strong> permissions on the CISO Dashboard. To activate your credentials and access the security operations console, please configure your new account password.
              </p>

              <!-- Main CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${setupUrl}" target="_blank" style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 10px 25px -5px rgba(99,102,241,0.5);letter-spacing:0.3px;">
                      Create / Set Your Password →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Invitation Summary Card -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#1f2937;border:1px solid #374151;border-radius:14px;padding:16px 20px;margin:24px 0;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;" width="40%">Account Name:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${name || '—'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Registered Email:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${to}</td>
                </tr>
                ${phone ? `<tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;">Phone Number:</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${phone}</td></tr>` : ''}
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Assigned Role:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#a5b4fc;">SuperAdmin (Global Platform)</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Authorized By:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${invitedBy || 'System Admin'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Link Validity:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#fbbf24;">24 Hours</td>
                </tr>
              </table>

              <!-- Fallback Direct Link -->
              <p style="margin:20px 0 6px 0;font-size:12px;color:#9ca3af;">
                If the button above does not work, copy and paste this secure URL directly into your browser:
              </p>
              <p style="margin:0 0 20px 0;font-size:11px;word-break:break-all;color:#818cf8;background-color:#0f172a;padding:10px 14px;border-radius:8px;border:1px solid #334155;font-family:monospace;">
                ${setupUrl}
              </p>

              <!-- Security Notice -->
              <div style="background-color:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px 16px;margin-top:20px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#fcd34d;">
                  🔒 <strong>Security Warning:</strong> This password setup link is single-use and expires in 24 hours. Do not forward or share this link with anyone. If you did not request or expect this email, please notify your security team immediately.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#0f172a;border-top:1px solid #1f2937;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">
                CISO Dashboard Security Platform • Automated Notification
              </p>
              <p style="margin:0;font-size:11px;color:#4b5563;">
                This is an automated administrative notification. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({ to, subject, text, html });
}

/**
 * Send a branded User / Member Password Setup Invitation Email (Image #23 style).
 */
async function sendUserInviteEmail({ to, name, phone, token, invitedBy, role = 'Member', orgName, req, appUrl }) {
  const baseUrl = appUrl || getAppUrl(req);
  const setupUrl = `${baseUrl}/setpassword?token=${encodeURIComponent(token)}&email=${encodeURIComponent(to)}`;

  const roleLabels = {
    superAdmin: 'SuperAdmin (Full Platform Access)',
    admin: 'Organisation Admin',
    org_admin: 'Organisation Admin',
    analyst: 'Security Analyst',
    viewer: 'Security Viewer',
    member: 'Organisation Member',
    org_user: 'Organisation Member',
  };
  const displayRole = roleLabels[role] || role;
  const displayOrg = orgName || 'CISO Dashboard Platform';

  const subject = `Action Required: Set up your CISO Dashboard Account Password (${displayOrg})`;

  const text = `Hello ${name || 'Team Member'},\n\nYou have been invited to join CISO Dashboard for "${displayOrg}" with the role: ${displayRole}.\n\nPlease set up your account password by visiting the following link (valid for 24 hours):\n${setupUrl}\n\nAccount Email: ${to}\nOrganisation: ${displayOrg}\nAssigned Role: ${displayRole}\nInvited By: ${invitedBy || 'Security Administrator'}\n\nIf you did not expect this invitation, please contact your security administrator.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Password Setup</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f4f6;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19;padding:40px 15px;">
    <tr>
      <td align="center">
        <!-- Email Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#111827;border-radius:18px;border:1px solid #374151;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);">

          <!-- Header Banner -->
          <tr>
            <td style="padding:32px 36px;background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;line-height:56px;background-color:rgba(255,255,255,0.15);border-radius:14px;font-size:28px;margin-bottom:12px;">
                🛡️
              </div>
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                CISO DASHBOARD
              </h1>
              <span style="display:inline-block;margin-top:6px;padding:3px 12px;background-color:rgba(0,0,0,0.25);border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;color:#e0e7ff;text-transform:uppercase;">
                Enterprise Security Access
              </span>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:36px 36px 28px 36px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#f9fafb;">
                Welcome to CISO Dashboard
              </h2>

              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                Hello <strong style="color:#ffffff;">${name || 'Team Member'}</strong>,
              </p>

              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                You have been invited to join <strong style="color:#ffffff;">${displayOrg}</strong> on the CISO Dashboard with <strong style="color:#a5b4fc;">${displayRole}</strong> privileges. To activate your account and access the platform, please configure your new account password.
              </p>

              <!-- Main CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${setupUrl}" target="_blank" style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 10px 25px -5px rgba(99,102,241,0.5);letter-spacing:0.3px;">
                      Create / Set Your Password →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Invitation Summary Card -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#1f2937;border:1px solid #374151;border-radius:14px;padding:16px 20px;margin:24px 0;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;" width="40%">Account Name:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${name || '—'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Registered Email:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${to}</td>
                </tr>
                ${phone ? `<tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;">Phone Number:</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${phone}</td></tr>` : ''}
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Organisation:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${displayOrg}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Assigned Role:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#a5b4fc;">${displayRole}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Authorized By:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${invitedBy || 'Security Administrator'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Link Validity:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#fbbf24;">24 Hours</td>
                </tr>
              </table>

              <!-- Fallback Direct Link -->
              <p style="margin:20px 0 6px 0;font-size:12px;color:#9ca3af;">
                If the button above does not work, copy and paste this secure URL directly into your browser:
              </p>
              <p style="margin:0 0 20px 0;font-size:11px;word-break:break-all;color:#818cf8;background-color:#0f172a;padding:10px 14px;border-radius:8px;border:1px solid #334155;font-family:monospace;">
                ${setupUrl}
              </p>

              <!-- Security Notice -->
              <div style="background-color:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px 16px;margin-top:20px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#fcd34d;">
                  🔒 <strong>Security Warning:</strong> This password setup link is single-use and expires in 24 hours. Do not forward or share this link with anyone. If you did not request or expect this email, please notify your administrator.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#0f172a;border-top:1px solid #1f2937;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">
                CISO Dashboard Security Platform • Automated Notification
              </p>
              <p style="margin:0;font-size:11px;color:#4b5563;">
                This is an automated administrative notification. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({ to, subject, text, html });
}

module.exports = { sendEmail, sendSuperAdminInviteEmail, sendUserInviteEmail };
