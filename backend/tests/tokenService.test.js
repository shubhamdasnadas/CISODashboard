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
  activateLicenseKey,
  generateLicenseRequestCode,
  verifyClockIntegrity,
  dateToEpochDays,
  epochDaysToDate,
  packOrgId,
  unpackOrgId,
  packLicenseKey,
  unpackLicenseKey,
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

test('computeTokenStatus returns expired when start_date and end_date are identical', () => {
  const sameDate = '2026-09-07';
  const status = computeTokenStatus(sameDate, sameDate);
  assert.equal(status, 'expired');
});

test('computeTokenStatus returns expired when end_date is before start_date', () => {
  const status = computeTokenStatus('2026-10-10', '2026-10-05');
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

test('extendOrgToken allows setting any validity end date without strict current-expiry restriction', async () => {
  let executedUpdateParams = [];
  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('SELECT * FROM org_tokens')) {
        return {
          rows: [{ id: 1, org_id: 10, start_date: '2026-01-01', end_date: '2027-04-05', status: 'active' }],
        };
      }
      if (sql.includes('SELECT id, org_name, slug, end_date FROM organisations')) {
        return {
          rows: [{ id: 10, org_name: 'Acme Corp', slug: 'acme-corp', end_date: '2027-04-05' }],
        };
      }
      if (sql.includes('UPDATE org_tokens')) {
        executedUpdateParams = params;
        return {
          rows: [{ id: 1, org_id: 10, end_date: params[0], status: params[1] }],
        };
      }
      return { rows: [] };
    },
  };

  const res = await extendOrgToken({
    orgId: 10,
    newEndDate: '2026-09-10', // Allowed to select any date
    reason: 'Custom date extension',
    actor: 'SuperAdmin',
    client: mockClient,
  });

  assert.equal(executedUpdateParams[0], '2026-09-10');
  assert.equal(res.tokenRecord.end_date, '2026-09-10');
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
            start_date: '2026-01-01',
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
            status: params[1],
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
  assert.equal(executedUpdateParams[0], '2027-10-01');
  assert.equal(executedUpdateParams[1], 'active');
  assert.equal(auditLogInserted, true);
});

test('generateLicenseRequestCode creates decodable client request blob', async () => {
  const mockClient = {
    query: async (sql) => {
      if (sql.includes('FROM organisations')) {
        return {
          rows: [{ id: 5, org_name: 'Delta Corp', slug: 'delta-corp', end_date: '2026-10-01', license_id: 'LIC-DELTA-99' }],
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

// ─── UNIT TESTS: CUSTOM BINARY KEY FORMAT ver(1)|org_id(16)|start(uint32)|end(uint32)|license_id(8) ───

test('dateToEpochDays and epochDaysToDate accurately round-trip calendar dates', () => {
  const startStr = '2026-10-14';
  const days = dateToEpochDays(startStr);
  assert.ok(days > 20000);
  const roundTrip = epochDaysToDate(days);
  assert.equal(roundTrip, startStr);

  const futureStr = '2027-10-14';
  const futureDays = dateToEpochDays(futureStr);
  assert.equal(futureDays - days, 365);
  assert.equal(epochDaysToDate(futureDays), futureStr);
});

test('packOrgId and unpackOrgId handle numeric org IDs and UUIDs', () => {
  const bufNumeric = packOrgId(42);
  assert.equal(bufNumeric.length, 16);
  assert.equal(unpackOrgId(bufNumeric), 42);

  const uuidHex = '550e8400e29b41d4a716446655440000';
  const bufUuid = packOrgId(uuidHex);
  assert.equal(bufUuid.length, 16);
  assert.equal(unpackOrgId(bufUuid), uuidHex);
});

test('packLicenseKey produces exact 33-byte (66 hex char) key matching custom binary format', () => {
  const orgId = 15;
  const startDate = '2026-10-14';
  const endDate = '2027-10-14';
  const explicitLicHex = 'A1B2C3D4E5F60718';

  const packed = packLicenseKey({
    version: 1,
    orgId,
    startDate,
    endDate,
    licenseId: explicitLicHex,
  });

  assert.ok(packed.rawToken.startsWith('ciso_lic_'));
  assert.equal(packed.hexString.length, 66); // 33 bytes * 2
  assert.equal(packed.buffer.length, 33);
  assert.equal(packed.licenseId, 'LIC-A1B2C3D4E5F60718');

  // Verify byte layout
  // ver(1)
  assert.equal(packed.buffer.readUInt8(0), 1);
  // org_id(16)
  assert.equal(unpackOrgId(packed.buffer.subarray(1, 17)), 15);
  // start(uint32, days)
  const startDays = packed.buffer.readUInt32BE(17);
  assert.equal(epochDaysToDate(startDays), startDate);
  // end(uint32, days)
  const endDays = packed.buffer.readUInt32BE(21);
  assert.equal(epochDaysToDate(endDays), endDate);
  // license_id(8)
  const licHex = packed.buffer.subarray(25, 33).toString('hex').toUpperCase();
  assert.equal(licHex, explicitLicHex);
});

test('unpackLicenseKey successfully parses packed 33-byte tokens', () => {
  const orgId = 99;
  const startDate = '2026-05-01';
  const endDate = '2027-05-01';

  const packed = packLicenseKey({
    version: 1,
    orgId,
    startDate,
    endDate,
  });

  const unpacked = unpackLicenseKey(packed.rawToken);
  assert.ok(unpacked);
  assert.equal(unpacked.version, 1);
  assert.equal(unpacked.orgId, 99);
  assert.equal(unpacked.startDate, startDate);
  assert.equal(unpacked.endDate, endDate);
  assert.equal(unpacked.licenseId, packed.licenseId);
  assert.ok(unpacked.formatString.includes('ver(1)'));
  assert.ok(unpacked.formatString.includes('org_id(16)'));
});

test('unpackLicenseKey returns null for invalid or corrupted tokens', () => {
  assert.equal(unpackLicenseKey(null), null);
  assert.equal(unpackLicenseKey(''), null);
  assert.equal(unpackLicenseKey('ciso_lic_tooshort'), null);
  assert.equal(unpackLicenseKey('invalid-characters-in-token-string'), null);
});

// ─── INTEGRATION / MOCKED TESTS: ACTIVATE LICENSE KEY WORKFLOW ───────────────

test('activateLicenseKey successfully unpacks custom binary key, extends date, and restores active status', async () => {
  const targetOrgId = 15;
  const startDate = '2026-10-14';
  const newEndDate = '2027-10-14';

  const packed = packLicenseKey({
    version: 1,
    orgId: targetOrgId,
    startDate,
    endDate: newEndDate,
  });

  let updatedOrg = null;
  let insertedToken = null;
  let auditLogged = false;

  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('SELECT * FROM organisations WHERE id = $1')) {
        return {
          rows: [{
            id: 15,
            org_name: 'Acme Security',
            slug: 'acme-sec',
            status: 'expired',
            end_date: '2026-09-01',
            is_active: false,
          }],
        };
      }
      if (sql.includes('UPDATE organisations')) {
        updatedOrg = {
          id: 15,
          org_name: 'Acme Security',
          slug: 'acme-sec',
          status: 'active',
          end_date: params[1],
          is_active: true,
        };
        return { rows: [updatedOrg] };
      }
      if (sql.includes('INSERT INTO org_tokens')) {
        insertedToken = {
          id: 101,
          org_id: params[0],
          license_id: params[1],
          token_hash: params[2],
          start_date: params[4],
          end_date: params[5],
          status: 'active',
        };
        return { rows: [insertedToken] };
      }
      if (sql.includes('INSERT INTO superadmin_audit_logs')) {
        auditLogged = true;
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  const result = await activateLicenseKey({
    licenseKey: packed.rawToken,
    targetOrgId: 15,
    actor: 'admin@acme.com',
    client: mockClient,
  });

  assert.equal(result.success, true);
  assert.equal(result.newEndDate, newEndDate);
  assert.equal(result.licenseId, packed.licenseId);
  assert.equal(result.organisation.status, 'active');
  assert.equal(result.organisation.is_active, true);
  assert.equal(result.organisation.is_expired, false);
  assert.equal(auditLogged, true);
});

test('activateLicenseKey rejects license key issued for another organisation', async () => {
  const packed = packLicenseKey({
    version: 1,
    orgId: 99, // Issued for Org 99
    startDate: '2026-10-14',
    endDate: '2027-10-14',
  });

  const mockClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    async () => {
      await activateLicenseKey({
        licenseKey: packed.rawToken,
        targetOrgId: 15, // Attempting to apply to Org 15
        actor: 'user',
        client: mockClient,
      });
    },
    (err) => {
      assert.match(err.message, /License key mismatch/i);
      return true;
    }
  );
});

test('activateLicenseKey rejects license key with past expiration date', async () => {
  const packed = packLicenseKey({
    version: 1,
    orgId: 15,
    startDate: '2024-01-01',
    endDate: '2024-12-31', // Past date
  });

  const mockClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    async () => {
      await activateLicenseKey({
        licenseKey: packed.rawToken,
        targetOrgId: 15,
        actor: 'user',
        client: mockClient,
      });
    },
    (err) => {
      assert.match(err.message, /Cannot activate expired license/i);
      return true;
    }
  );
});

test('activateLicenseKey successfully activates and upserts pre-generated license with matching license_id', async () => {
  const targetOrgId = 1;
  const startDate = '2026-09-19';
  const newEndDate = '2027-06-15';

  const packed = packLicenseKey({
    version: 1,
    orgId: targetOrgId,
    startDate,
    endDate: newEndDate,
    licenseId: '77875660efdd90ad',
  });

  let upsertQueryFound = false;

  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('SELECT * FROM organisations WHERE id = $1')) {
        return {
          rows: [{
            id: 1,
            org_name: 'Techsec Digital Global Pvt LTD',
            slug: 'techsec',
            status: 'expired',
            end_date: '2026-09-23',
            is_active: false,
          }],
        };
      }
      if (sql.includes('UPDATE organisations')) {
        return {
          rows: [{
            id: 1,
            org_name: 'Techsec Digital Global Pvt LTD',
            slug: 'techsec',
            status: 'active',
            end_date: params[1],
            is_active: true,
          }],
        };
      }
      if (sql.includes('INSERT INTO org_tokens') && sql.includes('ON CONFLICT (license_id) DO UPDATE SET')) {
        upsertQueryFound = true;
        return {
          rows: [{
            id: 42,
            org_id: 1,
            license_id: 'LIC-77875660EFDD90AD',
            status: 'active',
            end_date: newEndDate,
          }],
        };
      }
      if (sql.includes('INSERT INTO superadmin_audit_logs')) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  const result = await activateLicenseKey({
    licenseKey: packed.rawToken,
    targetOrgId: 1,
    actor: 'user',
    client: mockClient,
  });

  assert.equal(result.success, true);
  assert.equal(upsertQueryFound, true);
  assert.equal(result.licenseId, 'LIC-77875660EFDD90AD');
  assert.equal(result.newEndDate, newEndDate);
  assert.equal(result.organisation.status, 'active');
});

test('generateToken leaves expired organisation expired and marks token pending_activation until user activates', async () => {
  let orgTableUpdated = false;
  let tokenInsertedStatus = null;

  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, status, is_active, end_date FROM organisations')) {
        return {
          rows: [{
            id: 1,
            status: 'expired',
            is_active: false,
            end_date: '2026-09-23',
          }],
        };
      }
      if (sql.includes('SELECT id FROM org_tokens WHERE license_id')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO org_tokens')) {
        tokenInsertedStatus = params[6];
        return {
          rows: [{
            id: 10,
            org_id: 1,
            license_id: params[1],
            status: params[6],
          }],
        };
      }
      if (sql.includes('UPDATE organisations SET')) {
        orgTableUpdated = true;
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  const gen = await generateToken({
    orgId: 1,
    orgName: 'Techsec Digital Global Pvt LTD',
    slug: 'techsec',
    startDate: '2026-09-19',
    endDate: '2027-06-29',
    issuedBy: 'SuperAdmin',
    activateOrg: false,
    client: mockClient,
  });

  assert.ok(gen.rawToken.startsWith('ciso_lic_'));
  assert.equal(tokenInsertedStatus, 'pending_activation');
  assert.equal(orgTableUpdated, false, 'Organisations table must NOT be prematurely updated on token generation!');
});

test('activateLicenseKey updates existing token in org_tokens when pre-generated license_id is found', async () => {
  const targetOrgId = 1;
  const startDate = '2026-09-19';
  const newEndDate = '2027-06-29';

  const packed = packLicenseKey({
    version: 1,
    orgId: targetOrgId,
    startDate,
    endDate: newEndDate,
    licenseId: 'D09D5B182BFA6BA1',
  });

  let updateTokenSqlCalled = false;

  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('SELECT * FROM organisations WHERE id = $1')) {
        return {
          rows: [{
            id: 1,
            org_name: 'Techsec Digital Global Pvt LTD',
            slug: 'techsec',
            status: 'expired',
            end_date: '2026-09-23',
            is_active: false,
          }],
        };
      }
      if (sql.includes('UPDATE organisations')) {
        return {
          rows: [{
            id: 1,
            org_name: 'Techsec Digital Global Pvt LTD',
            slug: 'techsec',
            status: 'active',
            end_date: newEndDate,
            is_active: true,
          }],
        };
      }
      if (sql.includes('SELECT id, license_id FROM org_tokens')) {
        // Simulates existing pending token created by generateToken
        return {
          rows: [{ id: 88, license_id: 'LIC-D09D5B182BFA6BA1' }],
        };
      }
      if (sql.includes('UPDATE org_tokens SET') && sql.includes('WHERE id = $8')) {
        updateTokenSqlCalled = true;
        return {
          rows: [{
            id: 88,
            org_id: 1,
            license_id: 'LIC-D09D5B182BFA6BA1',
            status: 'active',
            end_date: newEndDate,
          }],
        };
      }
      if (sql.includes('INSERT INTO superadmin_audit_logs')) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  const result = await activateLicenseKey({
    licenseKey: packed.rawToken,
    targetOrgId: 1,
    actor: 'admin@techsec.com',
    client: mockClient,
  });

  assert.equal(result.success, true);
  assert.equal(updateTokenSqlCalled, true);
  assert.equal(result.licenseId, 'LIC-D09D5B182BFA6BA1');
  assert.equal(result.organisation.status, 'active');
  assert.equal(result.organisation.is_active, true);
  assert.equal(result.newEndDate, newEndDate);
});

