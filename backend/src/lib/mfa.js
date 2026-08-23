// backend/src/lib/mfa.js
// TOTP MFA using only Node.js built-in crypto.
// No speakeasy, no otpauth, no qrcode npm packages needed.

import crypto from 'crypto';
import { config } from '../config.js';

const SECRET_LENGTH = 20;        // 160 bits per RFC 4226/6238
const CODE_DIGITS = 6;
const TIME_STEP = 30;            // seconds
const VALID_WINDOW = 1;          // accept current ±1 step (±30s)
const BACKUP_CODE_COUNT = 10;

// Derive an encryption key from JWT_SECRET for encrypting TOTP secrets at rest.
// This means MFA secrets are only as strong as JWT_SECRET — which is already
// required to be 32+ chars in production.
function getEncryptionKey() {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is required for MFA secret encryption');
  }
  return crypto.createHash('sha256').update(config.jwtSecret).digest();
}

/**
 * Encrypt a plaintext TOTP secret for storage.
 * Returns "iv:ciphertext:authTag" hex string.
 */
export function encryptSecret(plainSecret) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * Decrypt a stored TOTP secret.
 */
export function decryptSecret(stored) {
  const [ivHex, cipherHex, tagHex] = stored.split(':');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generate a new random TOTP secret (base32, no padding).
 */
export function generateSecret() {
  const bytes = crypto.randomBytes(SECRET_LENGTH);
  return bytes.toString('base64')
    .replace(/[^A-Za-z2-7]/g, '')   // keep only base32 chars
    .slice(0, 32);                   // 32 chars = 160 bits
}

/**
 * Build the otpauth:// URL for QR code generation.
 */
export function getOtpauthUrl(email, secret, issuer = 'Alux Plaza') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(CODE_DIGITS),
    period: String(TIME_STEP),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Compute the current TOTP code for a given secret and time offset.
 */
function computeTOTP(secret, timeOffsetSteps = 0) {
  const key = Buffer.from(secret, 'base32');
  // For our base32-only secret, we need to decode it properly
  // Since we generated base32-compatible chars, we can treat it as base32
  // But Node's base32 decode is tricky; let's use the RFC 4648 base32 decode
  const decoded = base32Decode(secret);

  const counter = Math.floor(Date.now() / 1000 / TIME_STEP) + timeOffsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', decoded).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 |
                (hmac[offset + 1] & 0xff) << 16 |
                (hmac[offset + 2] & 0xff) << 8 |
                (hmac[offset + 3] & 0xff)) % (10 ** CODE_DIGITS);

  return String(code).padStart(CODE_DIGITS, '0');
}

/**
 * RFC 4648 base32 decode (A-Z, 2-7).
 */
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const map = new Map(alphabet.split('').map((c, i) => [c, i]));
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of str.toUpperCase()) {
    const idx = map.get(char);
    if (idx === undefined) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Verify a user-provided TOTP code against a secret.
 * Accepts current step ± VALID_WINDOW to handle clock drift.
 */
export function verifyTOTP(secret, code) {
  for (let offset = -VALID_WINDOW; offset <= VALID_WINDOW; offset++) {
    if (computeTOTP(secret, offset) === code) {
      return true;
    }
  }
  return false;
}

/**
 * Generate backup codes and return { plaintextCodes, hashedCodes }.
 * Plaintext codes are shown ONCE to the user during enrollment.
 * Hashed codes are bcrypt-hashed and stored in the DB.
 */
export async function generateBackupCodes() {
  const bcrypt = await import('bcryptjs');
  const plaintextCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // Format: XXXX-XXXX-XXXX (12 chars, easy to type)
    const code = crypto.randomBytes(6).toString('base64url').slice(0, 12).toUpperCase();
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
    plaintextCodes.push(formatted);
    hashedCodes.push(await bcrypt.hash(formatted, 12));
  }

  return { plaintextCodes, hashedCodes };
}

/**
 * Verify a backup code against stored hashed codes.
 * Returns the index of the matched code, or -1 if none match.
 */
export async function verifyBackupCode(code, hashedCodes) {
  const bcrypt = await import('bcryptjs');
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(code, hashedCodes[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Generate a short-lived MFA challenge token (JWT).
 * This is issued after successful password auth when MFA is enabled.
 * The user must present this + a TOTP code to get the real adminToken.
 */
export function generateMfaToken(userId, email) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { sub: userId, email, type: 'mfa_challenge' },
    config.jwtSecret,
    { expiresIn: '5m', jwtid: crypto.randomUUID() }
  );
}

/**
 * Verify an MFA challenge token.
 */
export function verifyMfaToken(token) {
  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.type !== 'mfa_challenge') return null;
    return decoded;
  } catch {
    return null;
  }
}
