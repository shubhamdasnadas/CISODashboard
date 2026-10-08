const cron = require('node-cron');
const { centralPool } = require('../db');
const { getDeploymentMode, getInstallId, toDateString } = require('./tokenService');
const { sendLicenseExpiredEmail, sendLicenseWarningEmail } = require('../utils/licenseMailer');

/**
 * Get email recipients for SuperAdmin notifications.
 */
async function getSuperAdminRecipients(client = centralPool) {
  const deploymentMode = getDeploymentMode();
  const recipients = new Set();

  // If vendor email is explicitly configured, include it
  if (process.env.VENDOR_SUPERADMIN_EMAIL) {
    recipients.add(process.env.VENDOR_SUPERADMIN_EMAIL.trim());
  }

  // In online mode (or fallback), query SuperAdmins from database
  try {
    const { rows } = await client.query(
      "SELECT email FROM users WHERE role = 'superAdmin' AND email IS NOT NULL AND deleted_at IS NULL"
    );
    for (const r of rows) {
      if (r.email) recipients.add(r.email.trim());
    }
  } catch (err) {
    console.warn('[licenseCron] Could not query superadmin emails:', err.message);
  }

  if (recipients.size === 0) {
    recipients.add(process.env.SUPERADMIN_EMAIL || 'superadmin@ciso.local');
  }

  return Array.from(recipients);
}

/**
 * Queue a notification in pending_notifications table for offline retries.
 */
async function queuePendingNotification({ type, recipient, payload, client = centralPool }) {
  try {
    await client.query(
      `INSERT INTO pending_notifications (type, recipient, payload, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [type, recipient, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error('[licenseCron] Failed to queue pending notification:', err.message);
  }
}

/**
 * Process pending notifications queue (retries failed offline email alerts).
 */
async function processPendingNotifications(client = centralPool) {
  try {
    const { rows } = await client.query(
      "SELECT * FROM pending_notifications WHERE status = 'pending' AND retry_count < 10 ORDER BY id ASC LIMIT 20"
    );

    for (const item of rows) {
      try {
        if (item.type === 'license_expired') {
          await sendLicenseExpiredEmail({
            to: item.recipient,
            ...item.payload,
          });
        } else if (item.type === 'license_warning') {
          await sendLicenseWarningEmail({
            to: item.recipient,
            ...item.payload,
          });
        }

        await client.query(
          "UPDATE pending_notifications SET status = 'sent', last_attempt = NOW() WHERE id = $1",
          [item.id]
        );
      } catch (err) {
        await client.query(
          `UPDATE pending_notifications
           SET retry_count = retry_count + 1, last_attempt = NOW(), error_message = $1
           WHERE id = $2`,
          [err.message, item.id]
        );
      }
    }
  } catch (err) {
    console.warn('[licenseCron] Error processing pending notifications:', err.message);
  }
}

/**
 * Check and process license expirations (transitions active -> expired, sends email once).
 */
async function checkLicenseExpirations(client = centralPool) {
  const deploymentMode = getDeploymentMode();
  const today = new Date().toISOString().slice(0, 10);
  const installId = await getInstallId(client);

  try {
    // 1. Transition tokens where end_date < today and status = 'active'
    const { rows: expiredTokens } = await client.query(
      `SELECT t.*, o.org_name, o.slug AS org_slug
       FROM org_tokens t
       JOIN organisations o ON o.id = t.org_id
       WHERE t.end_date < $1 AND t.status = 'active'
       ORDER BY t.id ASC`,
      [today]
    );

    for (const token of expiredTokens) {
      await client.query(
        "UPDATE org_tokens SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [token.id]
      );
      await client.query(
        "UPDATE organisations SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [token.org_id]
      );
      console.log(`[licenseCron] Token ${token.license_id} for org "${token.org_name}" transitioned to EXPIRED.`);
    }

    // 2. Find expired tokens that have NOT been notified yet
    const { rows: unnotifiedTokens } = await client.query(
      `SELECT t.*, o.org_name, o.slug AS org_slug
       FROM org_tokens t
       JOIN organisations o ON o.id = t.org_id
       WHERE t.end_date < $1
         AND t.expired_notified_at IS NULL
         AND t.status != 'revoked'
       ORDER BY t.id ASC`,
      [today]
    );

    if (unnotifiedTokens.length > 0) {
      const recipients = await getSuperAdminRecipients(client);

      for (const token of unnotifiedTokens) {
        const payload = {
          orgName: token.org_name,
          slug: token.org_slug,
          licenseId: token.license_id,
          startDate: toDateString(token.start_date),
          endDate: toDateString(token.end_date),
          expiredOn: today,
          reason: `License validity period ended on ${toDateString(token.end_date)}`,
          deploymentMode,
          installId,
        };

        for (const recipient of recipients) {
          try {
            await sendLicenseExpiredEmail({ to: recipient, ...payload });
          } catch (err) {
            console.error(`[licenseCron] Failed to send expired email for ${token.org_slug}:`, err.message);
            // Queue for offline retry
            await queuePendingNotification({
              type: 'license_expired',
              recipient,
              payload,
              client,
            });
          }
        }

        // Mark as notified in DB so email is never sent repeatedly
        await client.query(
          'UPDATE org_tokens SET expired_notified_at = NOW(), updated_at = NOW() WHERE id = $1',
          [token.id]
        );
      }
    }
  } catch (err) {
    console.error('[licenseCron] Error in checkLicenseExpirations:', err.message);
  }
}

/**
 * Check and send pre-expiry warnings (30, 15, and 7 days).
 */
async function checkPreExpiryWarnings(client = centralPool) {
  const deploymentMode = getDeploymentMode();
  const today = new Date().toISOString().slice(0, 10);
  const recipients = await getSuperAdminRecipients(client);

  try {
    // 30 Days Warning
    const { rows: warn30Rows } = await client.query(
      `SELECT t.*, o.org_name, o.slug AS org_slug,
              (t.end_date - CURRENT_DATE) AS days_remaining
       FROM org_tokens t
       JOIN organisations o ON o.id = t.org_id
       WHERE t.status = 'active'
         AND t.end_date >= CURRENT_DATE
         AND (t.end_date - CURRENT_DATE) <= 30
         AND t.warn_30d_notified_at IS NULL`,
    );

    for (const token of warn30Rows) {
      for (const recipient of recipients) {
        try {
          await sendLicenseWarningEmail({
            to: recipient,
            orgName: token.org_name,
            slug: token.org_slug,
            licenseId: token.license_id,
            daysRemaining: Math.max(1, Number(token.days_remaining)),
            endDate: toDateString(token.end_date),
            deploymentMode,
          });
        } catch (err) {
          await queuePendingNotification({
            type: 'license_warning',
            recipient,
            payload: {
              orgName: token.org_name,
              slug: token.org_slug,
              licenseId: token.license_id,
              daysRemaining: Number(token.days_remaining),
              endDate: toDateString(token.end_date),
              deploymentMode,
            },
            client,
          });
        }
      }
      await client.query(
        'UPDATE org_tokens SET warn_30d_notified_at = NOW(), updated_at = NOW() WHERE id = $1',
        [token.id]
      );
    }

    // 15 Days Warning
    const { rows: warn15Rows } = await client.query(
      `SELECT t.*, o.org_name, o.slug AS org_slug,
              (t.end_date - CURRENT_DATE) AS days_remaining
       FROM org_tokens t
       JOIN organisations o ON o.id = t.org_id
       WHERE t.status = 'active'
         AND t.end_date >= CURRENT_DATE
         AND (t.end_date - CURRENT_DATE) <= 15
         AND t.warn_15d_notified_at IS NULL`,
    );

    for (const token of warn15Rows) {
      for (const recipient of recipients) {
        try {
          await sendLicenseWarningEmail({
            to: recipient,
            orgName: token.org_name,
            slug: token.org_slug,
            licenseId: token.license_id,
            daysRemaining: Math.max(1, Number(token.days_remaining)),
            endDate: toDateString(token.end_date),
            deploymentMode,
          });
        } catch (err) {}
      }
      await client.query(
        'UPDATE org_tokens SET warn_15d_notified_at = NOW(), updated_at = NOW() WHERE id = $1',
        [token.id]
      );
    }

    // 7 Days Warning
    const { rows: warn7Rows } = await client.query(
      `SELECT t.*, o.org_name, o.slug AS org_slug,
              (t.end_date - CURRENT_DATE) AS days_remaining
       FROM org_tokens t
       JOIN organisations o ON o.id = t.org_id
       WHERE t.status = 'active'
         AND t.end_date >= CURRENT_DATE
         AND (t.end_date - CURRENT_DATE) <= 7
         AND t.warn_7d_notified_at IS NULL`,
    );

    for (const token of warn7Rows) {
      for (const recipient of recipients) {
        try {
          await sendLicenseWarningEmail({
            to: recipient,
            orgName: token.org_name,
            slug: token.org_slug,
            licenseId: token.license_id,
            daysRemaining: Math.max(1, Number(token.days_remaining)),
            endDate: toDateString(token.end_date),
            deploymentMode,
          });
        } catch (err) {}
      }
      await client.query(
        'UPDATE org_tokens SET warn_7d_notified_at = NOW(), updated_at = NOW() WHERE id = $1',
        [token.id]
      );
    }
  } catch (err) {
    console.error('[licenseCron] Error in checkPreExpiryWarnings:', err.message);
  }
}

/**
 * Master License Maintenance Job:
 * - Runs every day at 00:05 UTC (or scheduled interval)
 * - Also called on server startup
 */
async function runLicenseMaintenance() {
  console.log('[licenseCron] Running scheduled license maintenance check...');
  await checkLicenseExpirations();
  await checkPreExpiryWarnings();
  await processPendingNotifications();
  console.log('[licenseCron] License maintenance check completed.');
}

/**
 * Initialize License Cron Schedule.
 */
function initLicenseCron() {
  // Run once daily at 00:05
  cron.schedule('5 0 * * *', async () => {
    try {
      await runLicenseMaintenance();
    } catch (err) {
      console.error('[licenseCron] Error during scheduled license run:', err);
    }
  });

  // Also run every 30 minutes in background to process pending offline notification retries
  cron.schedule('*/30 * * * *', async () => {
    try {
      await processPendingNotifications();
    } catch (err) {
      // ignore
    }
  });

  // Run initial check on server startup (deferred 5s to allow DB connection)
  setTimeout(() => {
    runLicenseMaintenance().catch(err => {
      console.warn('[licenseCron] Startup check warning:', err.message);
    });
  }, 5000);

  console.log('⏰ License expiration & warning cron initialized.');
}

module.exports = {
  getSuperAdminRecipients,
  checkLicenseExpirations,
  checkPreExpiryWarnings,
  processPendingNotifications,
  runLicenseMaintenance,
  initLicenseCron,
};
