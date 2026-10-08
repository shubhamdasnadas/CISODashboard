const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const {
  hashToken,
  computeTokenStatus,
  signOfflineLicense,
  verifyOfflineLicenseSignature,
  toDateString,
  generateToken,
  verifyOrgToken,
  extendOrgToken,
  applyOfflineLicense,
  generateLicenseRequestCode,
  verifyClockIntegrity,
} = require('../services/tokenService');

// ─── UNIT TESTS: TOKEN HASHING & FORMATTING ─────────────────────────────────

test('hashToken produces deterministic 64-character SHA-256 hex string', () => {
  const rawToken = 'ciso_lic_a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const hash1 = hashToken(rawToken);
  const hash2 = hashToken(rawToken);

  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);

  const manualHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  assert.equal(hash1, manualHash);
});

test('toDateString correctly parses and formats dates to YYYY-MM-DD', () => {
  assert.equal(toDateString('2026-10-08'), '2026-10-08');
  assert.equal(toDateString(new Date('2026-12-31T12:00:00Z')), '2026-12-31');
  assert.equal(toDateString(null), null);
  assert.equal(toDateString('invalid-date'), null);
});

// ─── UNIT TESTS: EXPIRY DETECTION & STATUS COMPUTATION ──────────────────────

test('computeTokenStatus returns active for valid current date range', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const status = computeTokenStatus(yesterday, nextMonth);
  assert.equal(status, 'active');
});

test('computeTokenStatus returns expired when end_date is in the past', () => {
  const pastStart = '2025-01-01';
  const pastEnd = '2025-06-01';

  const status = computeTokenStatus(pastStart, pastEnd);
  assert.equal(status, 'expired');
});

test('computeTokenStatus returns upcoming when start_date is in the future', () => {
  const futureStart = '2099-01-01';
  const futureEnd = '2099-12-31';

  const status = computeTokenStatus(futureStart, futureEnd);
  assert.equal(status, 'upcoming');
});

test('computeTokenStatus returns revoked when isRevoked is true', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const status = computeTokenStatus(yesterday, nextMonth, true);
  assert.equal(status, 'revoked');
});

// ─── UNIT TESTS: OFFLINE CRYPTOGRAPHIC SIGNING & TAMPER REJECTION ───────────

test('signOfflineLicense and verifyOfflineLicenseSignature verify authentic payload', () => {
  const payload = {
    license_id: 'LIC-ACME-TEST-001',
    org_name: 'Acme Corp',
    slug: 'acme-corp',
    start_date: '2026-01-01',
    end_date: '2027-01-01',
    install_id: 'INST-TEST-1234',
  };

  const signedToken = signOfflineLicense(payload);
  assert.ok(signedToken && typeof signedToken === 'string');
  assert.ok(signedToken.startsWith('ey')); // Standard JWT header

  const verifyResult = verifyOfflineLicenseSignature(signedToken);
  assert.equal(verifyResult.valid, true);
  assert.equal(verifyResult.payload.license_id, payload.license_id);
  assert.equal(verifyResult.payload.slug, payload.slug);
});

test('verifyOfflineLicenseSignature rejects tampered token string', () => {
  const payload = {
    license_id: 'LIC-SECURE-002',
    org_name: 'Secure Bank',
    slug: 'secure-bank',
    start_date: '2026-01-01',
    end_date: '2026-06-01',
  };

  const signedToken = signOfflineLicense(payload);
  const parts = signedToken.split('.');
  assert.equal(parts.length, 3);

  // Tamper with signature
  const tamperedSignature = parts[0] + '.' + parts[1] + '.TAMPERED_SIG_XXX';
  const tamperedResult = verifyOfflineLicenseSignature(tamperedSignature);
  assert.equal(tamperedResult.valid, false);
  assert.ok(tamperedResult.error);

  // Tamper with payload (middle segment)
  const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
  decodedPayload.end_date = '2099-12-31'; // Attempt unauthorized extension
  const modifiedPayloadBase64 = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
  const tamperedPayloadToken = parts[0] + '.' + modifiedPayloadBase64 + '.' + parts[2];

  const payloadTamperResult = verifyOfflineLicenseSignature(tamperedPayloadToken);
  assert.equal(payloadTamperResult.valid, false);
});

// ─── UNIT TESTS: CLOCK ROLLBACK / TAMPERING DETECTION ─────────────────────────

test('verifyClockIntegrity detects backward clock drift', async () => {
  // Mock client where last_seen_timestamp is 2 days in the future relative to current time
  const futureLastSeen = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const mockClient = {
    query: async (sql) => {
      if (sql.includes('SELECT id, last_seen_timestamp FROM license_clock_state')) {
        return { rows: [{ id: 1, last_seen_timestamp: futureLastSeen }] };
      }
      return { rows: [] };
    },
  };

  const result = await verifyClockIntegrity(mockClient);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'CLOCK_ROLLBACK_DETECTED');
  assert.ok(result.message.includes('System clock tampering detected'));
});

test('verifyClockIntegrity passes for valid monotonic timestamp', async () => {
  const pastLastSeen = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
  let updated = false;
  const mockClient = {
    query: async (sql) => {
      if (sql.includes('SELECT id, last_seen_timestamp FROM license_clock_state')) {
        return { rows: [{ id: 1, last_seen_timestamp: pastLastSeen }] };
      }
      if (sql.includes('UPDATE license_clock_state')) {
        updated = true;
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  const result = await verifyClockIntegrity(mockClient);
  assert.equal(result.ok, true);
  assert.equal(updated, true);
});

// ─── INTEGRATION / DB-MOCKED TESTS: EXTEND & VERIFY WORKFLOW ─────────────────

test('extendOrgToken rejects when newEndDate is not strictly after current end_date', async () => {
  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('SELECT * FROM org_tokens')) {
        return {
          rows: [{ id: 1, org_id: 10, end_date: '2026-10-01', status: 'active' }],
        };
      }
      if (sql.includes('SELECT id, org_name, slug, end_date FROM organisations')) {
        return {
          rows: [{ id: 10, org_name: 'Acme Corp', slug: 'acme-corp', end_date: '2026-10-01' }],
        };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => {
      await extendOrgToken({
        orgId: 10,
        newEndDate: '2026-09-01', // Before current end date
        reason: 'Test extension',
        actor: 'SuperAdmin',
        client: mockClient,
      });
    },
    (err) => {
      assert.match(err.message, /must be after current end date/i);
      return true;
    }
  );
});

test('extendOrgToken resets notification flags and sets status to active', async () => {
  let executedUpdateSql = '';
  let executedUpdateParams = [];
  let auditLogInserted = false;

  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('SELECT * FROM org_tokens')) {
        return {
          rows: [{
            id: 1,
            org_id: 10,
            license_id: 'LIC-ACME-001',
            end_date: '2026-10-01',
            status: 'expired',
            expired_notified_at: '2026-10-02T00:00:00Z',
          }],
        };
      }
      if (sql.includes('SELECT id, org_name, slug, end_date FROM organisations')) {
        return {
          rows: [{ id: 10, org_name: 'Acme Corp', slug: 'acme-corp', end_date: '2026-10-01' }],
        };
      }
      if (sql.includes('UPDATE org_tokens')) {
        executedUpdateSql = sql;
        executedUpdateParams = params;
        return {
          rows: [{
            id: 1,
            org_id: 10,
            license_id: 'LIC-ACME-001',
            end_date: params[0],
            status: 'active',
            expired_notified_at: null,
          }],
        };
      }
      if (sql.includes('INSERT INTO superadmin_audit_logs')) {
        auditLogInserted = true;
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  const result = await extendOrgToken({
    orgId: 10,
    newEndDate: '2027-10-01',
    reason: 'Annual contract renewal',
    actor: 'admin@ciso.com',
    client: mockClient,
  });

  assert.equal(result.tokenRecord.status, 'active');
  assert.equal(result.tokenRecord.expired_notified_at, null);
  assert.ok(executedUpdateSql.includes('expired_notified_at = NULL'));
  assert.ok(executedUpdateSql.includes("status = 'active'"));
  assert.equal(executedUpdateParams[0], '2027-10-01');
  assert.equal(auditLogInserted, true);
});

test('generateLicenseRequestCode creates decodable client request blob', async () => {
  const mockClient = {
    query: async (sql) => {
      if (sql.includes('FROM organisations')) {
        return {
          rows: [{ id: 5, org_name: 'Delta Corp', slug: 'delta-corp', end_date: '2026-10-01' }],
        };
      }
      if (sql.includes('FROM org_tokens')) {
        return {
          rows: [{ license_id: 'LIC-DELTA-99', end_date: '2026-10-01' }],
        };
      }
      if (sql.includes('FROM license_clock_state')) {
        return { rows: [{ install_id: 'INST-DELTA-123' }] };
      }
      return { rows: [] };
    },
  };

  const { requestCode, payload } = await generateLicenseRequestCode(5, mockClient);

  assert.ok(requestCode.startsWith('CISO-REQ-'));
  assert.equal(payload.orgId, 5);
  assert.equal(payload.slug, 'delta-corp');
  assert.equal(payload.licenseId, 'LIC-DELTA-99');

  const base64Part = requestCode.replace('CISO-REQ-', '');
  const parsed = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf8'));
  assert.equal(parsed.orgName, 'Delta Corp');
  assert.equal(parsed.licenseId, 'LIC-DELTA-99');
});
