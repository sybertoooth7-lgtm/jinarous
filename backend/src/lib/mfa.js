// backend/src/lib/mfa.js
// TOTP MFA using only Node.js built-in crypto.

import crypto from 'crypto';
import { config } from '../config.js';

const SECRET_LENGTH = 20;
const CODE_DIGITS = 6;
const TIME_STEP = 30;
const VALID_WINDOW = 1;
const BACKUP_CODE_COUNT = 10;

function getEncryptionKey() {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is required for MFA secret encryption');
  }
  return crypto.createHash('sha256').update(config.jwtSecret).digest();
}

export function encryptSecret(plainSecret) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

export function decryptSecret(stored) {
  const [ivHex, cipherHex, tagHex] = stored.split(':');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', key, Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateSecret() {
  const bytes = crypto.randomBytes(SECRET_LENGTH);
  return bytes.toString('base64')
    .replace(/[^A-Za-z2-7]/g, '')
    .slice(0, 32);
}

export function getOtpauthUrl(email, secret, issuer = 'Alux Plaza') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const query = new URLSearchParams({
    secret, issuer, algorithm: 'SHA1', digits: String(CODE_DIGITS), period: String(TIME_STEP),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const map = new Map(alphabet.split('').map((c, i) => [c, i]));
  let bits = 0, value = 0;
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

function computeTOTP(secret, timeOffsetSteps = 0) {
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

export function verifyTOTP(secret, code) {
  for (let offset = -VALID_WINDOW; offset <= VALID_WINDOW; offset++) {
    if (computeTOTP(secret, offset) === code) return true;
  }
  return false;
}

export async function generateBackupCodes() {
  const bcrypt = await import('bcryptjs');
  const plaintextCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(6).toString('base64url').slice(0, 12).toUpperCase();
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
    plaintextCodes.push(formatted);
    hashedCodes.push(await bcrypt.hash(formatted, 12));
  }
  return { plaintextCodes, hashedCodes };
}

export async function verifyBackupCode(code, hashedCodes) {
  const bcrypt = await import('bcryptjs');
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(code, hashedCodes[i])) return i;
  }
  return -1;
}

export function generateMfaToken(userId, email) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { sub: userId, email, type: 'mfa_challenge' },
    config.jwtSecret,
    { expiresIn: '5m', jwtid: crypto.randomUUID() }
  );
}

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
