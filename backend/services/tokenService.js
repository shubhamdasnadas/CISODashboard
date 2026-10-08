const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { centralPool } = require('../db');

/**
 * Get current deployment mode ('online' | 'offline').
 */
function getDeploymentMode() {
  return String(process.env.DEPLOYMENT_MODE || 'online').toLowerCase().trim() === 'offline'
    ? 'offline'
    : 'online';
}

/**
 * Generate a unique install ID or get current one from database.
 */
async function getInstallId(client = centralPool) {
  try {
    const { rows } = await client.query('SELECT install_id FROM license_clock_state ORDER BY id ASC LIMIT 1');
    if (rows.length > 0 && rows[0].install_id) {
      return rows[0].install_id;
    }
    const newId = `INST-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    await client.query(
      'INSERT INTO license_clock_state (install_id, last_seen_timestamp) VALUES ($1, NOW())',
      [newId]
    );
    return newId;
  } catch (err) {
    return `INST-LOCAL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }
}

/**
 * Check for clock tampering / rollback.
 * Returns { ok: boolean, error?: string }
 */
async function verifyClockIntegrity(client = centralPool) {
  try {
    const { rows } = await client.query(
      'SELECT id, last_seen_timestamp FROM license_clock_state ORDER BY id ASC LIMIT 1'
    );
    const now = new Date();

    if (rows.length === 0) {
      const installId = `INST-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      await client.query(
        'INSERT INTO license_clock_state (install_id, last_seen_timestamp) VALUES ($1, NOW())',
        [installId]
      );
      return { ok: true };
    }

    const lastSeen = new Date(rows[0].last_seen_timestamp);
    // Allow up to 5 minutes backward skew for normal NTP adjustments
    const toleranceMs = 5 * 60 * 1000;
    if (now.getTime() < lastSeen.getTime() - toleranceMs) {
      return {
        ok: false,
        error: 'CLOCK_ROLLBACK_DETECTED',
        message: `System clock tampering detected. Current time (${now.toISOString()}) is earlier than last recorded activity (${lastSeen.toISOString()}).`,
      };
    }

    // Update last_seen if time has advanced
    if (now.getTime() > lastSeen.getTime()) {
      await client.query(
        'UPDATE license_clock_state SET last_seen_timestamp = NOW(), updated_at = NOW() WHERE id = $1',
        [rows[0].id]
      );
    }

    return { ok: true };
  } catch (err) {
    console.warn('[tokenService] Clock integrity check warning:', err.message);
    return { ok: true }; // Don't block if table is temporarily unavailable
  }
}

/**
 * Hash raw token using SHA-256 for secure DB storage.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken).trim()).digest('hex');
}

/**
 * Normalize date to YYYY-MM-DD string.
 */
function toDateString(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Determine token status based on dates and revocation.
 */
function computeTokenStatus(startDate, endDate, isRevoked = false) {
  if (isRevoked) return 'revoked';
  const today = new Date().toISOString().slice(0, 10);
  const start = toDateString(startDate);
  const end = toDateString(endDate);

  if (start && today < start) return 'upcoming';
  if (end && today > end) return 'expired';
  return 'active';
}

/**
 * Sign an offline license token using RSA/Ed25519 private key or fallback secret.
 */
function signOfflineLicense(payload) {
  const privateKey = process.env.LICENSE_PRIVATE_KEY;
  if (privateKey) {
    try {
      return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '10y' });
    } catch (err) {
      console.warn('[tokenService] RS256 signing failed, falling back to HMAC:', err.message);
    }
  }
  // Fallback signature with internal signing key if private key is not configured in dev
  const secret = process.env.LICENSE_SECRET || process.env.JWT_SECRET || 'ciso-enterprise-license-secret-key-2026';
  return jwt.sign(payload, secret, { expiresIn: '10y' });
}

/**
 * Verify an offline signed license token using public key or fallback secret.
 */
function verifyOfflineLicenseSignature(signedLicense) {
  const publicKey = process.env.LICENSE_PUBLIC_KEY;
  if (publicKey) {
    try {
      const decoded = jwt.verify(signedLicense, publicKey, { algorithms: ['RS256'] });
      return { valid: true, payload: decoded };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
  // Fallback verification in dev
  const secret = process.env.LICENSE_SECRET || process.env.JWT_SECRET || 'ciso-enterprise-license-secret-key-2026';
  try {
    const decoded = jwt.verify(signedLicense, secret);
    return { valid: true, payload: decoded };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Generate a new license token for an organisation.
 * Returns { rawToken, licenseId, tokenRecord }
 */
async function generateToken({
  orgId,
  orgName,
  slug,
  startDate,
  endDate,
  issuedBy = 'SuperAdmin',
  client = centralPool,
}) {
  const deploymentMode = getDeploymentMode();
  const startStr = toDateString(startDate) || new Date().toISOString().slice(0, 10);
  const endStr = toDateString(endDate) || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);

  const cleanSlug = (slug || 'org').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const randHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  const licenseId = `LIC-${cleanSlug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randHex}`;

  let rawToken = `ciso_lic_${crypto.randomBytes(24).toString('hex')}`;
  let signedLicense = null;

  if (deploymentMode === 'offline') {
    const installId = await getInstallId(client);
    const payload = {
      license_id: licenseId,
      org_id: orgId,
      org_name: orgName,
      slug: cleanSlug,
      start_date: startStr,
      end_date: endStr,
      install_id: installId,
      issued_by: issuedBy,
      issued_at: new Date().toISOString(),
    };
    signedLicense = signOfflineLicense(payload);
    rawToken = signedLicense;
  }

  const tokenHash = hashToken(rawToken);
  const rawPreview = rawToken.length > 20
    ? `${rawToken.slice(0, 10)}...${rawToken.slice(-4)}`
    : rawToken;
  const status = computeTokenStatus(startStr, endStr);

  // Insert or update org_tokens (one active primary token per org)
  const { rows } = await client.query(
    `INSERT INTO org_tokens (
      org_id, license_id, token_hash, raw_token_preview, start_date, end_date,
      status, issued_by, issued_at, signed_license, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW(), NOW())
    RETURNING *`,
    [orgId, licenseId, tokenHash, rawPreview, startStr, endStr, status, issuedBy, signedLicense]
  );

  // Keep organisations table in sync
  await client.query(
    'UPDATE organisations SET start_date = $1, end_date = $2, status = $3, updated_at = NOW() WHERE id = $4',
    [startStr, endStr, status, orgId]
  );

  return {
    rawToken,
    licenseId,
    tokenRecord: rows[0],
    deploymentMode,
  };
}

/**
 * Verify organisation token and license validity.
 * Returns { valid: boolean, code?: string, message?: string, token?: object }
 */
async function verifyOrgToken(orgId, client = centralPool) {
  if (!orgId) {
    return { valid: false, code: 'NO_ORG_CONTEXT', message: 'Organisation context required' };
  }

  // 1. Clock tampering check (offline & online protection)
  const clockCheck = await verifyClockIntegrity(client);
  if (!clockCheck.ok) {
    return {
      valid: false,
      code: 'CLOCK_ROLLBACK_DETECTED',
      message: clockCheck.message || 'Clock rollback detected',
    };
  }

  // 2. Fetch latest token for org
  const { rows } = await client.query(
    `SELECT t.*, o.org_name, o.slug AS org_slug, o.is_active AS org_is_active
     FROM org_tokens t
     JOIN organisations o ON o.id = t.org_id
     WHERE t.org_id = $1
     ORDER BY t.created_at DESC LIMIT 1`,
    [orgId]
  );

  if (rows.length === 0) {
    // Backfill token if missing for existing organisation
    const { rows: orgRows } = await client.query(
      'SELECT id, org_name, slug, start_date, end_date, is_active FROM organisations WHERE id = $1',
      [orgId]
    );
    if (orgRows.length > 0) {
      const org = orgRows[0];
      const gen = await generateToken({
        orgId: org.id,
        orgName: org.org_name,
        slug: org.slug,
        startDate: org.start_date,
        endDate: org.end_date,
        issuedBy: 'SystemAutoBackfill',
        client,
      });
      return verifyOrgToken(orgId, client);
    }
    return {
      valid: false,
      code: 'NO_TOKEN_FOUND',
      message: 'No license token found for this organisation. Contact administrator.',
    };
  }

  const token = rows[0];

  // 3. Check org active flag
  if (token.org_is_active === false) {
    return {
      valid: false,
      code: 'ORG_SUSPENDED',
      message: 'This organisation is currently suspended.',
      token,
    };
  }

  // 4. Check revocation
  if (token.status === 'revoked') {
    return {
      valid: false,
      code: 'TOKEN_REVOKED',
      message: 'The license token for this organisation has been revoked.',
      token,
    };
  }

  // 5. Offline deployment cryptographic signature check
  const deploymentMode = getDeploymentMode();
  if (deploymentMode === 'offline') {
    if (!token.signed_license) {
      return {
        valid: false,
        code: 'UNSIGNED_OFFLINE_TOKEN',
        message: 'Offline deployment requires a valid cryptographically signed license.',
        token,
      };
    }
    const sigCheck = verifyOfflineLicenseSignature(token.signed_license);
    if (!sigCheck.valid) {
      return {
        valid: false,
        code: 'TAMPERED_TOKEN',
        message: `License cryptographic signature verification failed: ${sigCheck.error}`,
        token,
      };
    }
    const payload = sigCheck.payload;
    // Verify payload matches org
    if (payload.slug && payload.slug !== token.org_slug) {
      return {
        valid: false,
        code: 'TOKEN_ORG_MISMATCH',
        message: 'License token does not match this organisation.',
        token,
      };
    }
  }

  // 6. Date window check
  const today = new Date().toISOString().slice(0, 10);
  const startStr = toDateString(token.start_date);
  const endStr = toDateString(token.end_date);

  if (startStr && today < startStr) {
    return {
      valid: false,
      code: 'TOKEN_NOT_YET_ACTIVE',
      message: `License validity starts on ${startStr}. Current date is ${today}.`,
      token,
    };
  }

  if (endStr && today > endStr) {
    // Lazy update status to expired if it was active
    if (token.status === 'active') {
      await client.query(
        "UPDATE org_tokens SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [token.id]
      );
      await client.query(
        "UPDATE organisations SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [token.org_id]
      );
      token.status = 'expired';
    }
    return {
      valid: false,
      code: 'TOKEN_EXPIRED',
      message: 'Organisation license expired, contact administrator',
      token,
      details: {
        orgId: token.org_id,
        orgName: token.org_name,
        slug: token.org_slug,
        licenseId: token.license_id,
        endDate: endStr,
        deploymentMode,
      },
    };
  }

  return { valid: true, token, deploymentMode };
}

/**
 * Extend token validity for an organisation (SuperAdmin only in online mode).
 */
async function extendOrgToken({
  orgId,
  newEndDate,
  reason = 'Validity extended by SuperAdmin',
  actor = 'SuperAdmin',
  client = centralPool,
}) {
  const deploymentMode = getDeploymentMode();

  // In offline mode on client install, direct manual extension without signed token is forbidden
  if (deploymentMode === 'offline') {
    throw new Error(
      'Manual date extension is disabled in Offline mode. Please upload a signed license token issued by vendor SuperAdmin.'
    );
  }

  const { rows: tokenRows } = await client.query(
    'SELECT * FROM org_tokens WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1',
    [orgId]
  );

  const { rows: orgRows } = await client.query(
    'SELECT id, org_name, slug, end_date FROM organisations WHERE id = $1',
    [orgId]
  );

  if (orgRows.length === 0) {
    throw new Error(`Organisation ID ${orgId} not found`);
  }

  const org = orgRows[0];
  const newEndStr = toDateString(newEndDate);
  if (!newEndStr) {
    throw new Error('Valid new end date (YYYY-MM-DD) is required');
  }

  const currentEndStr = toDateString(org.end_date) || (tokenRows[0] ? toDateString(tokenRows[0].end_date) : null);
  if (currentEndStr && newEndStr <= currentEndStr) {
    throw new Error(`New end date (${newEndStr}) must be after current end date (${currentEndStr})`);
  }

  let tokenRecord;
  if (tokenRows.length === 0) {
    // Generate new token with extended date
    const gen = await generateToken({
      orgId: org.id,
      orgName: org.org_name,
      slug: org.slug,
      startDate: new Date(),
      endDate: newEndStr,
      issuedBy: actor,
      client,
    });
    tokenRecord = gen.tokenRecord;
  } else {
    // Update existing token
    const tokenId = tokenRows[0].id;
    const { rows } = await client.query(
      `UPDATE org_tokens
       SET end_date = $1,
           status = 'active',
           expired_notified_at = NULL,
           warn_30d_notified_at = NULL,
           warn_15d_notified_at = NULL,
           warn_7d_notified_at = NULL,
           last_extended_by = $2,
           last_extended_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newEndStr, actor, tokenId]
    );
    tokenRecord = rows[0];
  }

  // Update organisations table
  await client.query(
    "UPDATE organisations SET end_date = $1, status = 'active', updated_at = NOW() WHERE id = $2",
    [newEndStr, orgId]
  );

  // Write audit log
  await client.query(
    `INSERT INTO superadmin_audit_logs (actor, target, target_type, action, details, created_at)
     VALUES ($1, $2, 'ORGANISATION_TOKEN', 'EXTEND_TOKEN_VALIDITY', $3, NOW())`,
    [
      actor,
      org.org_name,
      JSON.stringify({
        orgId,
        previousEndDate: currentEndStr,
        newEndDate: newEndStr,
        reason,
        licenseId: tokenRecord?.license_id,
      }),
    ]
  );

  return {
    success: true,
    tokenRecord,
    message: `License validity extended to ${newEndStr} successfully. Access restored.`,
  };
}

/**
 * Apply a cryptographically signed offline license token on the client install.
 */
async function applyOfflineLicense({
  signedLicense,
  actor = 'Admin',
  client = centralPool,
}) {
  if (!signedLicense || typeof signedLicense !== 'string') {
    throw new Error('Valid signed license token string is required');
  }

  const sigCheck = verifyOfflineLicenseSignature(signedLicense.trim());
  if (!sigCheck.valid) {
    throw new Error(`Invalid license signature: ${sigCheck.error}`);
  }

  const payload = sigCheck.payload;
  const { org_id, org_name, slug, start_date, end_date, license_id } = payload;

  if (!slug && !org_id) {
    throw new Error('License payload missing organisation identifier (slug or org_id)');
  }

  // Find matching organisation
  let org;
  if (org_id) {
    const { rows } = await client.query('SELECT * FROM organisations WHERE id = $1', [org_id]);
    org = rows[0];
  }
  if (!org && slug) {
    const { rows } = await client.query('SELECT * FROM organisations WHERE slug = $1', [slug]);
    org = rows[0];
  }

  if (!org) {
    throw new Error(`No matching organisation found for license (${slug || org_id})`);
  }

  const startStr = toDateString(start_date) || new Date().toISOString().slice(0, 10);
  const endStr = toDateString(end_date);
  if (!endStr) {
    throw new Error('License payload missing valid end_date');
  }

  const tokenHash = hashToken(signedLicense);
  const rawPreview = `${signedLicense.slice(0, 10)}...${signedLicense.slice(-4)}`;
  const status = computeTokenStatus(startStr, endStr);

  const { rows } = await client.query(
    `INSERT INTO org_tokens (
      org_id, license_id, token_hash, raw_token_preview, start_date, end_date,
      status, issued_by, issued_at, last_extended_by, last_extended_at,
      expired_notified_at, warn_30d_notified_at, warn_15d_notified_at, warn_7d_notified_at,
      signed_license, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW(), NULL, NULL, NULL, NULL, $10, NOW(), NOW())
    RETURNING *`,
    [
      org.id,
      license_id || `LIC-${org.slug.toUpperCase()}-${Date.now().toString(36)}`,
      tokenHash,
      rawPreview,
      startStr,
      endStr,
      status,
      payload.issued_by || 'VendorSuperAdmin',
      actor,
      signedLicense.trim(),
    ]
  );

  // Update organisations table
  await client.query(
    'UPDATE organisations SET start_date = $1, end_date = $2, status = $3, updated_at = NOW() WHERE id = $4',
    [startStr, endStr, status, org.id]
  );

  // Audit log
  await client.query(
    `INSERT INTO superadmin_audit_logs (actor, target, target_type, action, details, created_at)
     VALUES ($1, $2, 'ORGANISATION_TOKEN', 'APPLY_OFFLINE_LICENSE', $3, NOW())`,
    [
      actor,
      org.org_name,
      JSON.stringify({
        orgId: org.id,
        licenseId: rows[0].license_id,
        startDate: startStr,
        endDate: endStr,
        status,
      }),
    ]
  );

  return {
    success: true,
    tokenRecord: rows[0],
    message: `Signed license applied successfully. Organisation is now ${status}.`,
  };
}

/**
 * Generate a License Request Code (base64 blob) for offline extensions.
 */
async function generateLicenseRequestCode(orgId, client = centralPool) {
  const { rows } = await client.query(
    `SELECT o.id, o.org_name, o.slug, o.start_date, o.end_date, t.license_id
     FROM organisations o
     LEFT JOIN org_tokens t ON t.org_id = o.id
     WHERE o.id = $1
     ORDER BY t.created_at DESC LIMIT 1`,
    [orgId]
  );

  if (rows.length === 0) {
    throw new Error(`Organisation ID ${orgId} not found`);
  }

  const org = rows[0];
  const installId = await getInstallId(client);

  const requestPayload = {
    requestCodeVersion: '1.0',
    orgId: org.id,
    orgName: org.org_name,
    slug: org.slug,
    licenseId: org.license_id || 'N/A',
    currentEndDate: toDateString(org.end_date),
    installId,
    requestedAt: new Date().toISOString(),
  };

  const rawJson = JSON.stringify(requestPayload);
  const base64Code = Buffer.from(rawJson).toString('base64');

  return {
    requestCode: `CISO-REQ-${base64Code}`,
    payload: requestPayload,
  };
}

/**
 * Backfill missing tokens for all existing organisations in database.
 */
async function backfillAllOrgTokens(client = centralPool) {
  const { rows: orgs } = await client.query(
    `SELECT o.id, o.org_name, o.slug, o.start_date, o.end_date
     FROM organisations o
     WHERE o.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM org_tokens t WHERE t.org_id = o.id)`
  );

  let backfilled = 0;
  for (const org of orgs) {
    try {
      await generateToken({
        orgId: org.id,
        orgName: org.org_name,
        slug: org.slug,
        startDate: org.start_date || new Date(),
        endDate: org.end_date || new Date(Date.now() + 365 * 86400000),
        issuedBy: 'MigrationBackfill',
        client,
      });
      backfilled++;
    } catch (err) {
      console.error(`[tokenService] Backfill failed for org ${org.id}:`, err.message);
    }
  }

  if (backfilled > 0) {
    console.log(`✔  cisodashboard: backfilled tokens for ${backfilled} organisation(s)`);
  }
  return backfilled;
}

module.exports = {
  getDeploymentMode,
  getInstallId,
  verifyClockIntegrity,
  hashToken,
  toDateString,
  computeTokenStatus,
  signOfflineLicense,
  verifyOfflineLicenseSignature,
  generateToken,
  verifyOrgToken,
  extendOrgToken,
  applyOfflineLicense,
  generateLicenseRequestCode,
  backfillAllOrgTokens,
};
