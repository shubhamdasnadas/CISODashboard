#!/usr/bin/env node
/**
 * Utility script to generate RS256 Key Pair for Offline License Signing.
 *
 * Usage:
 *   node backend/scripts/generate-license-keys.js
 *
 * Output:
 *   Prints LICENSE_PUBLIC_KEY and LICENSE_PRIVATE_KEY ready to copy into .env
 */

const crypto = require('crypto');

console.log('🔐 Generating RSA-2048 Key Pair for Offline Enterprise Licenses...\n');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

console.log('================================================================');
console.log('VENDOR PRIVATE KEY (Keep confidential on TechSec server only):');
console.log('================================================================');
console.log(privateKey);

console.log('================================================================');
console.log('CLIENT PUBLIC KEY (Ship in client offline install .env):');
console.log('================================================================');
console.log(publicKey);

console.log('================================================================');
console.log('Sample .env entries:');
console.log('================================================================');
console.log(`LICENSE_PUBLIC_KEY="${publicKey.replace(/\n/g, '\\n')}"\n`);
console.log(`LICENSE_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"\n`);
