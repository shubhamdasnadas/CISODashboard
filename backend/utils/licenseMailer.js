const { sendEmail } = require('./mailer');
const { getAppUrl } = require('./networkIp');

/**
 * Format a date string into readable format: "08 Oct 2026"
 */
function formatDate(d) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

/**
 * Send License Expired Notification Email to SuperAdmin(s) or Vendor SuperAdmin.
 */
async function sendLicenseExpiredEmail({
  to,
  orgName,
  slug,
  licenseId,
  startDate,
  endDate,
  expiredOn,
  reason,
  deploymentMode = 'online',
  installId,
  req,
  appUrl,
}) {
  const baseUrl = appUrl || getAppUrl(req);
  const consoleUrl = `${baseUrl}/superadmin-console`;

  const formattedStart = formatDate(startDate);
  const formattedEnd = formatDate(endDate);
  const formattedExpired = formatDate(expiredOn || new Date());
  const displayReason = reason || `License validity period ended on ${formattedEnd}`;

  const subject = `⚠️ URGENT: License Expired for "${orgName}" (${slug})`;

  const text = `URGENT SECURITY NOTIFICATION: License Expired

Organisation: ${orgName} (${slug})
License ID: ${licenseId || 'N/A'}
Deployment Mode: ${deploymentMode.toUpperCase()}
Start Date: ${formattedStart}
End Date: ${formattedEnd}
Expired On: ${formattedExpired}
Reason: ${displayReason}
${installId ? `Install ID: ${installId}\n` : ''}
All non-superadmin users belonging to this organisation have been blocked from accessing the platform.

To restore access or extend validity, visit the SuperAdmin Console:
${consoleUrl}

--
CISO Dashboard Security Platform
Automated License Enforcement`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>License Expired Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f4f6;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19;padding:40px 15px;">
    <tr>
      <td align="center">
        <!-- Email Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#111827;border-radius:18px;border:1px solid #dc2626;overflow:hidden;box-shadow:0 25px 50px -12px rgba(220,38,38,0.3);">

          <!-- Header Banner -->
          <tr>
            <td style="padding:32px 36px;background:linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%);text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;line-height:56px;background-color:rgba(255,255,255,0.15);border-radius:14px;font-size:28px;margin-bottom:12px;">
                ⚠️
              </div>
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                ORGANISATION LICENSE EXPIRED
              </h1>
              <span style="display:inline-block;margin-top:6px;padding:3px 12px;background-color:rgba(0,0,0,0.35);border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;color:#fca5a5;text-transform:uppercase;">
                ${deploymentMode.toUpperCase()} DEPLOYMENT
              </span>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:36px 36px 28px 36px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#f87171;">
                Access Blocked: Action Required
              </h2>

              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                The enterprise license token for <strong style="color:#ffffff;">${orgName}</strong> (<code style="color:#fca5a5;">${slug}</code>) has reached its expiration date.
              </p>

              <div style="background-color:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:14px 18px;margin:20px 0;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#fca5a5;">
                  🔒 <strong>Enforcement Status:</strong> All tenant member logins and API integrations for this organisation are currently suspended until an extended license token is applied.
                </p>
              </div>

              <!-- License Details Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#1f2937;border:1px solid #374151;border-radius:14px;padding:16px 20px;margin:24px 0;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;" width="40%">Organisation:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${orgName} (${slug})</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">License ID:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#93c5fd;font-family:monospace;">${licenseId || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Validity Window:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${formattedStart} → ${formattedEnd}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Expired On:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#f87171;">${formattedExpired}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Reason:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#e5e7eb;">${displayReason}</td>
                </tr>
                ${installId ? `<tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;">Install ID:</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#a5b4fc;font-family:monospace;">${installId}</td></tr>` : ''}
              </table>

              <!-- Action CTA -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${consoleUrl}" target="_blank" style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 10px 25px -5px rgba(239,68,68,0.5);letter-spacing:0.3px;">
                      Open SuperAdmin Console to Extend →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#0f172a;border-top:1px solid #1f2937;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">
                CISO Dashboard Security Platform • Automated License Management
              </p>
              <p style="margin:0;font-size:11px;color:#4b5563;">
                This alert was generated automatically. Expiration notices are sent once per expired validity cycle.
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
 * Send License Pre-Expiry Warning Notification (30, 15, or 7 days remaining).
 */
async function sendLicenseWarningEmail({
  to,
  orgName,
  slug,
  licenseId,
  daysRemaining,
  endDate,
  deploymentMode = 'online',
  req,
  appUrl,
}) {
  const baseUrl = appUrl || getAppUrl(req);
  const consoleUrl = `${baseUrl}/superadmin-console`;
  const formattedEnd = formatDate(endDate);

  const subject = `⏳ License Expiring in ${daysRemaining} Days: "${orgName}" (${slug})`;

  const text = `LICENSE EXPIRATION WARNING

Organisation: ${orgName} (${slug})
License ID: ${licenseId || 'N/A'}
Days Remaining: ${daysRemaining} days
Expiration Date: ${formattedEnd}
Deployment Mode: ${deploymentMode.toUpperCase()}

The license for this organisation will expire soon. Please extend the validity before ${formattedEnd} to avoid service disruption.

Extend validity now in the SuperAdmin Console:
${consoleUrl}

--
CISO Dashboard Security Platform`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>License Expiration Warning</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f4f6;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19;padding:40px 15px;">
    <tr>
      <td align="center">
        <!-- Email Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#111827;border-radius:18px;border:1px solid #f59e0b;overflow:hidden;box-shadow:0 25px 50px -12px rgba(245,158,11,0.25);">

          <!-- Header Banner -->
          <tr>
            <td style="padding:32px 36px;background:linear-gradient(135deg, #d97706 0%, #b45309 100%);text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;line-height:56px;background-color:rgba(255,255,255,0.15);border-radius:14px;font-size:28px;margin-bottom:12px;">
                ⏳
              </div>
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                LICENSE EXPIRING SOON
              </h1>
              <span style="display:inline-block;margin-top:6px;padding:3px 12px;background-color:rgba(0,0,0,0.3);border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;color:#fef3c7;text-transform:uppercase;">
                ${daysRemaining} DAYS REMAINING
              </span>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:36px 36px 28px 36px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#fbbf24;">
                Proactive Renewal Reminder
              </h2>

              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                The license for <strong style="color:#ffffff;">${orgName}</strong> (<code style="color:#fde68a;">${slug}</code>) is scheduled to expire on <strong style="color:#fbbf24;">${formattedEnd}</strong>.
              </p>

              <!-- Summary Card -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#1f2937;border:1px solid #374151;border-radius:14px;padding:16px 20px;margin:24px 0;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;" width="40%">Organisation:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#ffffff;">${orgName}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">License ID:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#93c5fd;font-family:monospace;">${licenseId || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Expiration Date:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#fbbf24;">${formattedEnd}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Days Remaining:</td>
                  <td style="padding:6px 0;font-size:13px;font-weight:600;color:#f59e0b;">${daysRemaining} Days</td>
                </tr>
              </table>

              <!-- Action CTA -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${consoleUrl}" target="_blank" style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 10px 25px -5px rgba(245,158,11,0.5);letter-spacing:0.3px;">
                      Extend License Validity →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#0f172a;border-top:1px solid #1f2937;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">
                CISO Dashboard Security Platform • Automated License Management
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

module.exports = {
  formatDate,
  sendLicenseExpiredEmail,
  sendLicenseWarningEmail,
};
