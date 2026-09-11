const crypto = require('crypto');

// Single source of truth for the OTP lifetime (used for expiry checks AND so
// the verification email always states the real expiration window).
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cryptographically secure 6-digit OTP (never uses Math.random).
const generateSecureOtp = () => String(crypto.randomInt(100000, 1000000));

// OTP is hashed before storage (sha-256 with a per-user pepper), so the
// plaintext code never exists anywhere outside the email send.
const hashOtp = (otp, email) => {
  const pepper = process.env.OTP_PEPPER || '';
  return crypto
    .createHash('sha256')
    .update(`${String(otp)}|${String(email).toLowerCase().trim()}|${pepper}`)
    .digest('hex');
};

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const maskEmail = (email) => {
  const e = String(email || '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at <= 0) return e;
  const first = e.slice(0, 1);
  const stars = '*'.repeat(Math.max(2, Math.min(at - 1, 3)));
  return `${first}${stars}${e.slice(at)}`;
};

module.exports = { OTP_TTL_MS, generateSecureOtp, hashOtp, safeEqual, maskEmail };