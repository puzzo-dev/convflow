// src/platform/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
const BCRYPT_ROUNDS = 10;
const BCRYPT_MAX_PASSWORD_BYTES = 72;
const JWT_EXPIRES_IN = '7d';
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
    if (secret.length < 32)
        throw new Error('FATAL: JWT_SECRET must be at least 32 characters long.');
    return secret;
}
export function validateJwtSecret() {
    getJwtSecret(); // throws on missing/weak secret — call at startup
}
export async function hashPassword(password) {
    // bcrypt silently truncates at 72 bytes; reject longer passwords to avoid
    // false security and prevent bcrypt DoS amplification attacks.
    if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
        throw new Error('Password must not exceed 72 bytes');
    }
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}
export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
export function generateToken(payload) {
    return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN });
}
export function verifyToken(token) {
    return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}
