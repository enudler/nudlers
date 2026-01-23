
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { encrypt, decrypt } from '../pages/api/utils/encryption';

describe('Encryption Utility Security', () => {
    // Set a valid 32-byte hex key for testing
    // 32 bytes = 64 hex characters
    const MOCK_KEY = 'a'.repeat(64);

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = MOCK_KEY;
    });

    const testData = 'SensitivePassword123!';

    it('should encrypt and decrypt data correctly', () => {
        const encrypted = encrypt(testData);
        expect(encrypted).not.toBe(testData);
        expect(encrypted.split(':')).toHaveLength(3); // iv:encrypted:tag

        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(testData);
    });

    it('should produce different ciphertexts for the same plaintext (due to random IV)', () => {
        const encrypted1 = encrypt(testData);
        const encrypted2 = encrypt(testData);
        expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail to decrypt if the authentication tag is tampered with', () => {
        const encrypted = encrypt(testData);
        const parts = encrypted.split(':');
        // Modify the auth tag (last part)
        parts[2] = parts[2].substring(0, parts[2].length - 2) + '00';
        const tampered = parts.join(':');

        expect(() => decrypt(tampered)).toThrow();
    });

    it('should fail to decrypt if the encrypted data is tampered with', () => {
        const encrypted = encrypt(testData);
        const parts = encrypted.split(':');
        // Modify the encrypted data (middle part)
        parts[1] = parts[1].substring(0, parts[1].length - 2) + '00';
        const tampered = parts.join(':');

        expect(() => decrypt(tampered)).toThrow();
    });

    it('should fail to decrypt if a different key is used', () => {
        const encrypted = encrypt(testData);

        // We need to simulate a different key. 
        // Since the key is fixed in the module, we can either use a manual implementation of decrypt 
        // with a different key to show it fails, or re-import.
        // Let's implement a manual decrypt with a wrong key for verification.

        const WRONG_KEY = 'f'.repeat(64); // Different from any likely test key
        const WRONG_KEY_BUFFER = Buffer.from(WRONG_KEY, 'hex');
        const ALGORITHM = 'aes-256-gcm';

        const [ivHex, encryptedData, authTagHex] = encrypted.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        expect(() => {
            const decipher = crypto.createDecipheriv(ALGORITHM, WRONG_KEY_BUFFER, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
        }).toThrow();
    });
});
