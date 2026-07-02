import crypto from 'crypto';
// AES-256-GCM encryption for credentials at rest.
// Stored format: base64(iv).base64(authTag).base64(ciphertext)
const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit nonce, standard for GCM
function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex)
        throw new Error('ENCRYPTION_KEY is not set — cannot encrypt/decrypt credentials.');
    const key = Buffer.from(hex, 'hex');
    if (key.length !== 32)
        throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars).');
    return key;
}
export function encryptSecret(plaintext) {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}
export function decryptSecret(blob) {
    const [ivB64, tagB64, ctB64] = blob.split('.');
    if (!ivB64 || !tagB64 || !ctB64)
        throw new Error('Malformed encrypted blob');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
    return pt.toString('utf8');
}
// Convenience wrappers for JSON credential objects.
export function encryptJson(obj) {
    return encryptSecret(JSON.stringify(obj));
}
export function decryptJson(blob) {
    return JSON.parse(decryptSecret(blob));
}
