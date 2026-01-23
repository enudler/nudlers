import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey() {
  const key = process.env.NUDLERS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  const buffer = Buffer.from(key, 'hex');
  if (buffer.length !== 32) {
    throw new Error(`Invalid encryption key: charLen=${key.length}, bufferLen=${buffer.length}. Expected 32 byte buffer from 64-character hex string.`);
  }
  return buffer;
}

export function encrypt(text) {
  const keyBuffer = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine IV, encrypted data, and auth tag
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

export function decrypt(encryptedText) {
  const keyBuffer = getEncryptionKey();
  const [ivHex, encryptedData, authTagHex] = encryptedText.split(':');

  if (!ivHex || !encryptedData || !authTagHex) {
    throw new Error('Invalid encrypted text format. Expected iv:data:tag');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}