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

  // If start date and end date are the same or end is before start, it is expired
  if (start && end && start === end) return 'expired';
  if (start && end && end < start) return 'expired';
  // If end date is in the past, it is expired
  if (end && today > end) return 'expired';
  // If start date is in the future, it is upcoming
  if (start && today < start) return 'upcoming';
  return 'active';
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CUSTOM BINARY LICENSE KEY PACKING & UNPACKING ENGINE
 * Format: ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
 * Total: 1 + 16 + 4 + 4 + 8 = 33 bytes (66 hex characters)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Converts a date (string YYYY-MM-DD or Date object) into uint32 days since Unix epoch (1970-01-01 UTC).
 */
function dateToEpochDays(d) {
  if (!d) return 0;
  const str = toDateString(d);
  if (!str) return 0;
  const [y, m, day] = str.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
}

/**
 * Converts uint32 days since Unix epoch back into a YYYY-MM-DD string.
 */
function epochDaysToDate(days) {
  if (days === undefined || days === null || isNaN(days) || days < 0) return null;
  return new Date(days * 86400000).toISOString().slice(0, 10);
}

/**
 * Packs an orgId into a 16-byte Buffer.
 * Supports:
 * - 16-byte Buffer
 * - Numeric ID (written into last 8 bytes as big-endian BigInt)
 * - 32-hex character string / 36-char UUID
 * - UTF-8 string (truncated/padded to 16 bytes)
 */
function packOrgId(orgId) {
  const buf = Buffer.alloc(16, 0);
  if (!orgId && orgId !== 0) return buf;

  if (Buffer.isBuffer(orgId) && orgId.length === 16) {
    orgId.copy(buf);
    return buf;
  }

  if (typeof orgId === 'number' || typeof orgId === 'bigint') {
    buf.writeBigUInt64BE(BigInt(orgId), 8);
    return buf;
  }

  const str = String(orgId).trim();
  if (/^\d+$/.test(str)) {
    buf.writeBigUInt64BE(BigInt(str), 8);
    return buf;
  }

  const cleanHex = str.replace(/[^a-fA-F0-9]/g, '');
  if (cleanHex.length === 32) {
    Buffer.from(cleanHex, 'hex').copy(buf);
    return buf;
  }

  Buffer.from(str, 'utf8').copy(buf, 0, 0, 16);
  return buf;
}

/**
 * Unpacks a 16-byte Buffer into an org identifier.
 */
function unpackOrgId(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== 16) {
    return null;
  }
  const isHighZero = buf.subarray(0, 8).every((b) => b === 0);
  const lowBigInt = buf.readBigUInt64BE(8);
  if (isHighZero && lowBigInt >= 0n && lowBigInt <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(lowBigInt);
  }
  return buf.toString('hex');
}

/**
 * Pack license key into custom binary format:
 * ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
 *
 * Buffer layout (33 bytes total):
 *   [0..1)   ver(1)              : uint8 (default 1)
 *   [1..17)  org_id(16)          : 16 bytes binary org identifier
 *   [17..21) start(uint32, days) : uint32 big-endian days since 1970-01-01
 *   [21..25) end(uint32, days)   : uint32 big-endian days since 1970-01-01
 *   [25..33) license_id(8)       : 8 bytes unique binary identifier
 *
 * Output: ciso_lic_<66 hex characters>
 */
function packLicenseKey({
  version = 1,
  orgId,
  startDate,
  endDate,
  licenseId,
}) {
  const keyBuffer = Buffer.alloc(33, 0);

  // 1. ver(1)
  keyBuffer.writeUInt8(Number(version) & 0xff, 0);

  // 2. org_id(16)
  const orgBuf = packOrgId(orgId);
  orgBuf.copy(keyBuffer, 1);

  // 3. start(uint32, days)
  const startDays = dateToEpochDays(startDate);
  keyBuffer.writeUInt32BE(startDays, 17);

  // 4. end(uint32, days)
  const endDays = dateToEpochDays(endDate);
  keyBuffer.writeUInt32BE(endDays, 21);

  // 5. license_id(8)
  let licBuf;
  if (Buffer.isBuffer(licenseId) && licenseId.length === 8) {
    licBuf = licenseId;
  } else if (typeof licenseId === 'string' && licenseId.replace(/[^a-fA-F0-9]/g, '').length === 16) {
    licBuf = Buffer.from(licenseId.replace(/[^a-fA-F0-9]/g, ''), 'hex');
  } else {
    licBuf = crypto.randomBytes(8);
  }
  licBuf.copy(keyBuffer, 25);

  const hexString = keyBuffer.toString('hex');
  const rawToken = `ciso_lic_${hexString}`;
  const licenseIdHex = licBuf.toString('hex').toUpperCase();
  const formattedLicenseId = `LIC-${licenseIdHex}`;

  return {
    rawToken,
    hexString,
    buffer: keyBuffer,
    licenseId: formattedLicenseId,
    parsedKey: {
      version: Number(version),
      orgId: unpackOrgId(orgBuf),
      orgIdHex: orgBuf.toString('hex'),
      startDays,
      endDays,
      startDate: epochDaysToDate(startDays),
      endDate: epochDaysToDate(endDays),
      licenseId: formattedLicenseId,
      licenseIdHex,
      formatString: `ver(${version}) | org_id(16) | start(${startDays}d) | end(${endDays}d) | license_id(${licenseIdHex})`,
    },
  };
}

/**
 * Unpacks a license key string in format:
 * ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
 */
function unpackLicenseKey(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') return null;
  let clean = tokenString.trim();
  if (clean.startsWith('ciso_lic_')) {
    clean = clean.slice('ciso_lic_'.length);
  }

  // Must be 66 hex characters (33 bytes)
  if (!/^[0-9a-fA-F]{66}$/.test(clean)) {
    return null;
  }

  const buf = Buffer.from(clean, 'hex');
  const version = buf.readUInt8(0);
  const orgBuf = buf.subarray(1, 17);
  const startDays = buf.readUInt32BE(17);
  const endDays = buf.readUInt32BE(21);
  const licBuf = buf.subarray(25, 33);
  const licenseIdHex = licBuf.toString('hex').toUpperCase();

  return {
    version,
    orgId: unpackOrgId(orgBuf),
    orgIdHex: orgBuf.toString('hex'),
    startDays,
    endDays,
    startDate: epochDaysToDate(startDays),
    endDate: epochDaysToDate(endDays),
    licenseId: `LIC-${licenseIdHex}`,
    licenseIdHex,
    rawHex: clean,
    formatString: `ver(${version}) | org_id(16) | start(${startDays}d) | end(${endDays}d) | license_id(${licenseIdHex})`,
  };
}

/**
 * Format PEM string to handle escaped newlines (\n) and surrounding quotes.
 */
function formatPemKey(key) {
  if (!key || typeof key !== 'string') return null;
  let formatted = key.trim();
  if (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1);
  }
  return formatted.replace(/\\n/g, '\n').replace(/\\r/g, '');
}

/**
 * Sign an offline license token using RSA/Ed25519 private key or fallback secret.
 */
function signOfflineLicense(payload) {
  const privateKey = formatPemKey(process.env.LICENSE_PRIVATE_KEY);
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
  if (!signedLicense || typeof signedLicense !== 'string') {
    return { valid: false, error: 'License token string is required' };
  }

  const cleanToken = signedLicense.trim();
  let header = null;
  try {
    const decodedWithHeader = jwt.decode(cleanToken, { complete: true });
    header = decodedWithHeader?.header;
  } catch (decodeErr) {
    return { valid: false, error: 'Malformed JWT token structure' };
  }

  const publicKey = formatPemKey(process.env.LICENSE_PUBLIC_KEY);
  const privateKey = formatPemKey(process.env.LICENSE_PRIVATE_KEY);

  // 1. If token is RS256 and RSA public key is available, verify with RSA public key
  if (header?.alg === 'RS256' && publicKey) {
    try {
      const decoded = jwt.verify(cleanToken, publicKey, { algorithms: ['RS256'] });
      return { valid: true, payload: decoded };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  // 2. If token is RS256 and private key is present (e.g. local single-machine dev setup)
  if (header?.alg === 'RS256' && privateKey) {
    try {
      const decoded = jwt.verify(cleanToken, privateKey, { algorithms: ['RS256'] });
      return { valid: true, payload: decoded };
    } catch (err) {
      // Continue to try fallback
    }
  }

  // 3. Fallback verification with HMAC candidate secrets (HS256)
  const candidateSecrets = [
    process.env.LICENSE_SECRET,
    process.env.JWT_SECRET,
    'ciso-enterprise-license-secret-key-2026',
  ].filter(Boolean);

  let lastError = 'Invalid signature';
  for (const secret of candidateSecrets) {
    try {
      const decoded = jwt.verify(cleanToken, secret);
      return { valid: true, payload: decoded };
    } catch (err) {
      lastError = err.message;
    }
  }

  return { valid: false, error: lastError };
}

/**
 * Generate a new license token for an organisation.
 * Uses custom binary layout:
 * ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
 * Returns { rawToken, licenseId, tokenRecord, deploymentMode, parsedKey, keyFormat }
 */
async function generateToken({
  orgId,
  orgName,
  slug,
  startDate,
  endDate,
  issuedBy = 'SuperAdmin',
  activateOrg = false,
  client = centralPool,
}) {
  const deploymentMode = getDeploymentMode();
  const startStr = toDateString(startDate) || new Date().toISOString().slice(0, 10);
  const endStr = toDateString(endDate) || startStr;

  const cleanSlug = (slug || 'org').toLowerCase().replace(/[^a-z0-9_-]/g, '_');

  // Check current organisation status
  const { rows: currentOrgRows } = await client.query(
    'SELECT id, status, is_active, end_date FROM organisations WHERE id = $1',
    [orgId]
  );
  const currentOrg = currentOrgRows[0];
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentEndStr = currentOrg?.end_date ? toDateString(currentOrg.end_date) : null;
  const isCurrentlyExpired = currentOrg && (
    currentOrg.status === 'expired' ||
    currentOrg.is_active === false ||
    (currentEndStr && currentEndStr < todayStr)
  );

  // Pack key according to user's custom specification:
  // ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
  const packed = packLicenseKey({
    version: 1,
    orgId,
    startDate: startStr,
    endDate: endStr,
  });

  const licenseId = packed.licenseId;
  let rawToken = packed.rawToken;
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
      raw_key: packed.rawToken,
      key_format: 'ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)',
      parsed_key: packed.parsedKey,
    };
    signedLicense = signOfflineLicense(payload);
    rawToken = signedLicense;
  }

  const tokenHash = hashToken(rawToken);
  const rawPreview = rawToken.length > 20
    ? `${rawToken.slice(0, 14)}...${rawToken.slice(-6)}`
    : rawToken;

  const isSameDate = Boolean(startStr && endStr && startStr === endStr);
  const isPastDate = Boolean(endStr && endStr < todayStr);
  const isExpiredToken = isSameDate || isPastDate || (startStr && endStr && endStr < startStr);

  // If dates are identical or past, token is expired.
  // If the organisation is currently expired/inactive and activateOrg is not requested,
  // store token as 'pending_activation' and do NOT update organisations table.
  // The organisation remains expired until the user submits the key in the activation modal!
  const tokenStatus = isExpiredToken
    ? 'expired'
    : ((isCurrentlyExpired && !activateOrg)
        ? 'pending_activation'
        : computeTokenStatus(startStr, endStr));

  // Check if token with this license_id already exists to prevent any conflict
  const { rows: existingTokens } = await client.query(
    'SELECT id FROM org_tokens WHERE license_id = $1 OR UPPER(license_id) = UPPER($1) LIMIT 1',
    [licenseId]
  );

  let tokenRecord;
  if (existingTokens.length > 0) {
    const updateRes = await client.query(
      `UPDATE org_tokens SET
        org_id = $1,
        token_hash = $2,
        raw_token_preview = $3,
        start_date = $4,
        end_date = $5,
        status = $6,
        issued_by = $7,
        issued_at = NOW(),
        signed_license = $8,
        updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [orgId, tokenHash, rawPreview, startStr, endStr, tokenStatus, issuedBy, signedLicense, existingTokens[0].id]
    );
    tokenRecord = updateRes.rows[0];
  } else {
    const insertRes = await client.query(
      `INSERT INTO org_tokens (
        org_id, license_id, token_hash, raw_token_preview, start_date, end_date,
        status, issued_by, issued_at, signed_license, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW(), NOW())
      ON CONFLICT (license_id) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        token_hash = EXCLUDED.token_hash,
        raw_token_preview = EXCLUDED.raw_token_preview,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        status = EXCLUDED.status,
        issued_by = EXCLUDED.issued_by,
        issued_at = NOW(),
        signed_license = EXCLUDED.signed_license,
        updated_at = NOW()
      RETURNING *`,
      [orgId, licenseId, tokenHash, rawPreview, startStr, endStr, tokenStatus, issuedBy, signedLicense]
    );
    tokenRecord = insertRes.rows[0];
  }

  // Only update organisations table if activateOrg is explicitly true or if org is not expired
  if (activateOrg || !isCurrentlyExpired) {
    await client.query(
      'UPDATE organisations SET start_date = $1, end_date = $2, status = $3, updated_at = NOW() WHERE id = $4',
      [startStr, endStr, tokenStatus, orgId]
    );
  }

  return {
    rawToken,
    licenseId,
    tokenRecord,
    deploymentMode,
    parsedKey: packed.parsedKey,
    keyFormat: 'ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)',
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
      await generateToken({
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

  const today = new Date().toISOString().slice(0, 10);
  const startStr = toDateString(token.start_date);
  const endStr = toDateString(token.end_date);
  const isSameDate = Boolean(startStr && endStr && startStr === endStr);

  // 3. Check org active flag
  if (token.org_is_active === false) {
    const isExpiredOrg = token.status === 'expired' || isSameDate || (endStr && today > endStr);
    return {
      valid: false,
      code: isExpiredOrg ? 'TOKEN_EXPIRED' : 'ORG_SUSPENDED',
      message: isExpiredOrg
        ? 'Organisation license expired, contact administrator'
        : 'This organisation is currently suspended.',
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

  // 4b. Check pending activation
  if (token.status === 'pending_activation') {
    return {
      valid: false,
      code: 'TOKEN_PENDING_ACTIVATION',
      message: 'License token is pending activation. Please enter the token in the activation modal to enable access.',
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
  // If start date and end date are the exact same day, it is immediately expired
  if (isSameDate) {
    if (token.status === 'active') {
      await client.query(
        "UPDATE org_tokens SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [token.id]
      );
      await client.query(
        "UPDATE organisations SET status = 'expired', is_active = false, updated_at = NOW() WHERE id = $1",
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
        "UPDATE organisations SET status = 'expired', is_active = false, updated_at = NOW() WHERE id = $1",
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

  const tokenStart = tokenRows[0]?.start_date || org.start_date || new Date();
  const nextStatus = computeTokenStatus(tokenStart, newEndStr);
  const orgIsActive = nextStatus === 'active';

  let tokenRecord;
  if (tokenRows.length === 0) {
    // Generate new token with extended date
    const gen = await generateToken({
      orgId: org.id,
      orgName: org.org_name,
      slug: org.slug,
      startDate: org.start_date || new Date(),
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
           status = $2,
           expired_notified_at = NULL,
           warn_30d_notified_at = NULL,
           warn_15d_notified_at = NULL,
           warn_7d_notified_at = NULL,
           last_extended_by = $3,
           last_extended_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newEndStr, nextStatus, actor, tokenId]
    );
    tokenRecord = rows[0];
  }

  // Update organisations table
  await client.query(
    "UPDATE organisations SET end_date = $1, status = $2, is_active = $3, updated_at = NOW() WHERE id = $4",
    [newEndStr, nextStatus, orgIsActive, orgId]
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

  // Find matching organisation by org_id, slug, or org_name
  let org;
  if (org_id) {
    const { rows } = await client.query('SELECT * FROM organisations WHERE id = $1', [org_id]);
    org = rows[0];
  }
  if (!org && slug) {
    const cleanSlug = slug.toLowerCase().replace(/^\/+/, '');
    const { rows } = await client.query(
      `SELECT * FROM organisations
       WHERE LOWER(slug) = $1
          OR LOWER(slug) = $2
          OR LOWER(REPLACE(slug, '-', '_')) = LOWER(REPLACE($1, '-', '_'))
          OR (LENGTH($3) > 0 AND LOWER(org_name) = LOWER($3))
       LIMIT 1`,
      [cleanSlug, `/${cleanSlug}`, org_name || '']
    );
    org = rows[0];
  }
  if (!org && org_name) {
    const { rows } = await client.query(
      'SELECT * FROM organisations WHERE LOWER(org_name) = LOWER($1) LIMIT 1',
      [org_name.trim()]
    );
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
    ON CONFLICT (license_id) DO UPDATE SET
      org_id = EXCLUDED.org_id,
      token_hash = EXCLUDED.token_hash,
      raw_token_preview = EXCLUDED.raw_token_preview,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      status = EXCLUDED.status,
      issued_by = EXCLUDED.issued_by,
      last_extended_by = EXCLUDED.last_extended_by,
      last_extended_at = NOW(),
      expired_notified_at = NULL,
      warn_30d_notified_at = NULL,
      warn_15d_notified_at = NULL,
      warn_7d_notified_at = NULL,
      signed_license = EXCLUDED.signed_license,
      updated_at = NOW()
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
 * Verify and activate a license key for an organisation.
 * Supports:
 * 1. Custom binary layout: ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
 *    prefixed by ciso_lic_ or raw hex
 * 2. Cryptographically signed JWT token (offline license)
 */
async function activateLicenseKey({
  licenseKey,
  targetOrgId = null,
  actor = 'User',
  client = centralPool,
}) {
  const cleanKey = (licenseKey || '').trim();
  if (!cleanKey) {
    throw new Error('License key string is required');
  }

  let startDate = null;
  let endDate = null;
  let licenseId = null;
  let keyFormat = '';
  let parsedKey = null;
  let signedLicenseContent = null;
  let matchedOrgId = targetOrgId ? Number(targetOrgId) : null;
  let matchedSlug = null;
  let matchedOrgName = null;

  // 1. Try custom binary format
  const unpacked = unpackLicenseKey(cleanKey);
  if (unpacked) {
    keyFormat = 'Custom Binary Key (33-byte packed)';
    parsedKey = unpacked;
    startDate = unpacked.startDate;
    endDate = unpacked.endDate;
    licenseId = unpacked.licenseId;

    if (unpacked.orgId) {
      if (typeof unpacked.orgId === 'number' && unpacked.orgId > 0) {
        if (matchedOrgId && matchedOrgId !== unpacked.orgId) {
          throw new Error(`License key mismatch: Key was issued for Organisation #${unpacked.orgId}, but target organisation is #${matchedOrgId}.`);
        }
        matchedOrgId = unpacked.orgId;
      } else if (typeof unpacked.orgId === 'string') {
        matchedSlug = unpacked.orgId;
      }
    }
  } else {
    // 2. Try signed offline license signature (JWT)
    const sigCheck = verifyOfflineLicenseSignature(cleanKey);
    if (sigCheck.valid && sigCheck.payload) {
      keyFormat = 'Cryptographically Signed Offline License';
      const payload = sigCheck.payload;
      signedLicenseContent = cleanKey;
      startDate = toDateString(payload.start_date) || new Date().toISOString().slice(0, 10);
      endDate = toDateString(payload.end_date);
      licenseId = payload.license_id;
      parsedKey = payload.parsed_key || null;

      if (payload.org_id) {
        if (matchedOrgId && Number(payload.org_id) !== matchedOrgId) {
          throw new Error(`License token mismatch: Issued for Organisation #${payload.org_id}, not #${matchedOrgId}.`);
        }
        matchedOrgId = Number(payload.org_id);
      }
      if (payload.slug) matchedSlug = payload.slug;
      if (payload.org_name) matchedOrgName = payload.org_name;
    } else {
      throw new Error(
        'Invalid license key format. Expected binary key (ver(1) | org_id(16) | start | end | license_id) or signed license token.'
      );
    }
  }

  if (!endDate) {
    throw new Error('License key is missing a valid expiration date.');
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (startDate && endDate && startDate === endDate) {
    throw new Error(`Cannot activate expired license: Key start date and end date are the same (${startDate}).`);
  }
  if (endDate < todayStr) {
    throw new Error(`Cannot activate expired license: Key expiration date is ${endDate}, which is in the past.`);
  }

  // Find target organisation
  let org = null;
  if (matchedOrgId) {
    const { rows } = await client.query('SELECT * FROM organisations WHERE id = $1 AND deleted_at IS NULL', [matchedOrgId]);
    org = rows[0];
  }
  if (!org && matchedSlug) {
    const cleanSlug = matchedSlug.toLowerCase().replace(/^\/+/, '');
    const { rows } = await client.query(
      `SELECT * FROM organisations
       WHERE (LOWER(slug) = $1 OR LOWER(slug) = $2 OR LOWER(REPLACE(slug, '-', '_')) = LOWER(REPLACE($1, '-', '_')))
         AND deleted_at IS NULL
       LIMIT 1`,
      [cleanSlug, `/${cleanSlug}`]
    );
    org = rows[0];
  }
  if (!org && matchedOrgName) {
    const { rows } = await client.query(
      'SELECT * FROM organisations WHERE LOWER(org_name) = LOWER($1) AND deleted_at IS NULL LIMIT 1',
      [matchedOrgName.trim()]
    );
    org = rows[0];
  }

  if (!org) {
    throw new Error(`No matching organisation found in the system (Org ID: ${matchedOrgId || 'unknown'}).`);
  }

  const tokenHash = hashToken(cleanKey);
  const rawPreview = cleanKey.length > 20
    ? `${cleanKey.slice(0, 14)}...${cleanKey.slice(-6)}`
    : cleanKey;

  if (!licenseId) {
    licenseId = `LIC-${(org.slug || 'ORG').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  }

  // Update organisations table
  const { rows: updatedOrgRows } = await client.query(
    `UPDATE organisations
     SET start_date = COALESCE($1, start_date),
         end_date = $2,
         status = 'active',
         is_active = true,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [startDate || todayStr, endDate, org.id]
  );
  const updatedOrg = updatedOrgRows[0];

  // Deactivate any prior different active tokens for this organisation so this key is the primary active one
  await client.query(
    `UPDATE org_tokens
     SET status = 'expired', updated_at = NOW()
     WHERE org_id = $1 AND license_id != $2 AND status = 'active'`,
    [org.id, licenseId]
  );

  // Check if token already exists for this license_id (exact or case-insensitive)
  const { rows: existingTokens } = await client.query(
    'SELECT id, license_id FROM org_tokens WHERE license_id = $1 OR UPPER(license_id) = UPPER($1) LIMIT 1',
    [licenseId]
  );

  let tokenRows;
  if (existingTokens.length > 0) {
    const updateRes = await client.query(
      `UPDATE org_tokens SET
        org_id = $1,
        token_hash = $2,
        raw_token_preview = $3,
        start_date = $4,
        end_date = $5,
        status = 'active',
        last_extended_by = $6,
        last_extended_at = NOW(),
        expired_notified_at = NULL,
        warn_30d_notified_at = NULL,
        warn_15d_notified_at = NULL,
        warn_7d_notified_at = NULL,
        signed_license = COALESCE($7, signed_license),
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        org.id,
        tokenHash,
        rawPreview,
        startDate || todayStr,
        endDate,
        actor,
        signedLicenseContent,
        existingTokens[0].id,
      ]
    );
    tokenRows = updateRes.rows;
  } else {
    // If not found, use INSERT with ON CONFLICT fallback
    const insertRes = await client.query(
      `INSERT INTO org_tokens (
        org_id, license_id, token_hash, raw_token_preview, start_date, end_date,
        status, issued_by, issued_at, last_extended_by, last_extended_at,
        expired_notified_at, warn_30d_notified_at, warn_15d_notified_at, warn_7d_notified_at,
        signed_license, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'active', 'UserLicenseActivation', NOW(), $7, NOW(),
        NULL, NULL, NULL, NULL, $8, NOW(), NOW()
      )
      ON CONFLICT (license_id) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        token_hash = EXCLUDED.token_hash,
        raw_token_preview = EXCLUDED.raw_token_preview,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        status = 'active',
        last_extended_by = EXCLUDED.last_extended_by,
        last_extended_at = NOW(),
        expired_notified_at = NULL,
        warn_30d_notified_at = NULL,
        warn_15d_notified_at = NULL,
        warn_7d_notified_at = NULL,
        signed_license = COALESCE(EXCLUDED.signed_license, org_tokens.signed_license),
        updated_at = NOW()
      RETURNING *`,
      [
        org.id,
        licenseId,
        tokenHash,
        rawPreview,
        startDate || todayStr,
        endDate,
        actor,
        signedLicenseContent,
      ]
    );
    tokenRows = insertRes.rows;
  }

  // Write audit log
  await client.query(
    `INSERT INTO superadmin_audit_logs (actor, target, target_type, action, details, created_at)
     VALUES ($1, $2, 'ORGANISATION_TOKEN', 'ACTIVATE_LICENSE_KEY', $3, NOW())`,
    [
      actor,
      org.org_name,
      JSON.stringify({
        orgId: org.id,
        licenseId,
        previousEndDate: org.end_date,
        newEndDate: endDate,
        keyFormat,
      }),
    ]
  );

  return {
    success: true,
    message: `License key verified and activated successfully! Organisation validity extended until ${endDate}.`,
    newEndDate: endDate,
    startDate: startDate || todayStr,
    licenseId,
    keyFormat,
    parsedKey,
    tokenRecord: tokenRows[0],
    organisation: {
      ...updatedOrg,
      is_active: true,
      is_suspended: false,
      is_expired: false,
      license_status: 'active',
      block_reason: null,
    },
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
  dateToEpochDays,
  epochDaysToDate,
  packOrgId,
  unpackOrgId,
  packLicenseKey,
  unpackLicenseKey,
  signOfflineLicense,
  verifyOfflineLicenseSignature,
  generateToken,
  verifyOrgToken,
  extendOrgToken,
  applyOfflineLicense,
  activateLicenseKey,
  generateLicenseRequestCode,
  backfillAllOrgTokens,
};
