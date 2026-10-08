#!/usr/bin/env node
/**
 * Vendor CLI Tool: Issue cryptographically signed offline license token.
 *
 * Usage:
 *   node backend/scripts/issue-offline-license.js --org "Acme Corp" --slug acme --start 2026-10-01 --end 2027-10-01
 *   or interactive mode.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const orgName = getArg('--org', 'Enterprise Client');
const slug = getArg('--slug', 'client_org').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
const startDate = getArg('--start', new Date().toISOString().slice(0, 10));
const endDate = getArg('--end', new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
const installId = getArg('--install-id', 'ANY');
const issuedBy = getArg('--issuer', 'TechSec SuperAdmin');

// Read private key from env or argument
let privateKey = process.env.LICENSE_PRIVATE_KEY;
if (!privateKey && getArg('--key-file')) {
  privateKey = fs.readFileSync(path.resolve(getArg('--key-file')), 'utf8');
}

const licenseId = `LIC-${slug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const payload = {
  license_id: licenseId,
  org_name: orgName,
  slug,
  start_date: startDate,
  end_date: endDate,
  install_id: installId,
  issued_by: issuedBy,
  issued_at: new Date().toISOString(),
};

let signedToken;
if (privateKey) {
  signedToken = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '10y' });
} else {
  console.warn('⚠️  No LICENSE_PRIVATE_KEY found. Signing with fallback secret.');
  const secret = process.env.LICENSE_SECRET || process.env.JWT_SECRET || 'ciso-enterprise-license-secret-key-2026';
  signedToken = jwt.sign(payload, secret, { expiresIn: '10y' });
}

console.log('\n================================================================');
console.log('✅ SIGNED OFFLINE LICENSE GENERATED SUCCESSFULLY');
console.log('================================================================');
console.log(`Organisation: ${orgName} (${slug})`);
console.log(`License ID:   ${licenseId}`);
console.log(`Validity:     ${startDate} → ${endDate}`);
console.log(`Install ID:   ${installId}`);
console.log('----------------------------------------------------------------');
console.log('SIGNED LICENSE TOKEN STRING (Send to client):');
console.log('----------------------------------------------------------------');
console.log(signedToken);
console.log('================================================================\n');
