import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

vi.mock('../utils/logger.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

// Mock encryption with deterministic behavior
vi.mock('../pages/api/utils/encryption', () => ({
    encrypt: vi.fn((text) => `encrypted:${text}`),
    decrypt: vi.fn((text) => text.replace('encrypted:', '')),
    safeDecrypt: vi.fn((text) => text.replace('encrypted:', '')),
    VaultLockedError: class VaultLockedError extends Error {
        status: number;
        constructor() {
            super('Vault is locked');
            this.name = 'VaultLockedError';
            this.status = 401;
        }
    }
}));

import { getDB } from '../pages/api/db';
import { encrypt } from '../pages/api/utils/encryption';
import credentialsHandler from '../pages/api/credentials/index';
import credentialByIdHandler from '../pages/api/credentials/[id]';
import truncateHandler from '../pages/api/credentials/truncate/[id]';

describe('Credentials API (/api/credentials)', () => {
    let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
    let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = { query: vi.fn(), release: vi.fn() };
        (getDB as any).mockResolvedValue(mockClient);
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /api/credentials', () => {
        it('should return all credentials with decrypted fields but no password', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    vendor: 'visaCal',
                    username: 'encrypted:user1',
                    password: 'encrypted:secret123',
                    id_number: 'encrypted:12345',
                    card6_digits: null,
                    nickname: 'My Visa',
                    bank_account_number: null,
                    is_active: true,
                    created_at: '2024-01-01',
                    last_synced_at: '2024-01-15'
                }]
            });

            await credentialsHandler({ method: 'GET', query: {} } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const data = mockRes.json.mock.calls[0][0];

            // Username should be decrypted
            expect(data[0].username).toBe('user1');
            // id_number should be decrypted
            expect(data[0].id_number).toBe('12345');
            // Password must NEVER be returned
            expect(data[0].password).toBeUndefined();
            // Other fields
            expect(data[0].vendor).toBe('visaCal');
            expect(data[0].nickname).toBe('My Visa');
            expect(data[0].is_active).toBe(true);
        });

        it('should filter by vendor when query param is provided', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            await credentialsHandler({ method: 'GET', query: { vendor: 'max' } } as any, mockRes as any);

            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain('WHERE vendor = $1');
            expect(params).toEqual(['max']);
        });

        it('should handle null encrypted fields gracefully', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    vendor: 'hapoalim',
                    username: null,
                    password: null,
                    id_number: null,
                    card6_digits: null,
                    nickname: 'Bank',
                    bank_account_number: '12345',
                    is_active: null,
                    created_at: '2024-01-01',
                    last_synced_at: null
                }]
            });

            await credentialsHandler({ method: 'GET', query: {} } as any, mockRes as any);

            const data = mockRes.json.mock.calls[0][0];
            expect(data[0].username).toBeNull();
            expect(data[0].id_number).toBeNull();
            expect(data[0].card6_digits).toBeNull();
            // is_active defaults to true when null
            expect(data[0].is_active).toBe(true);
        });
    });

    describe('Yahav save validation', () => {
        it.each(['POST', 'PUT'])('%s rejects missing, empty and whitespace-only national IDs', async (method) => {
            for (const id_number of [undefined, '', '   ', null, 12345678]) {
                const handler = method === 'POST' ? credentialsHandler : credentialByIdHandler;
                await handler({
                    method,
                    query: { id: '1' },
                    body: { vendor: 'yahav', nickname: 'Bank', username: 'test-user', id_number }
                } as any, mockRes as any);
                expect(mockRes.status).toHaveBeenLastCalledWith(400);
                expect(mockRes.json).toHaveBeenLastCalledWith({ error: 'National ID is required for Yahav' });
            }
            expect(mockClient.query).not.toHaveBeenCalled();
            expect(encrypt).not.toHaveBeenCalled();
        });

        it.each(['POST', 'PUT'])('%s preserves a valid national ID with a leading zero', async (method) => {
            mockClient.query.mockResolvedValue({ rows: [{ id: 1, vendor: 'yahav', id_number: 'encrypted:012345678' }] });
            const handler = method === 'POST' ? credentialsHandler : credentialByIdHandler;
            await handler({
                method,
                query: { id: '1' },
                body: { vendor: 'yahav', nickname: 'Bank', username: 'test-user', id_number: '012345678' }
            } as any, mockRes as any);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(encrypt).toHaveBeenCalledWith('012345678');
            expect(mockClient.query.mock.calls[0][1]).toContain('encrypted:012345678');
        });
    });

    describe('POST /api/credentials', () => {
        it('should encrypt sensitive fields before storing', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    vendor: 'visaCal',
                    username: 'encrypted:user1',
                    password: 'encrypted:pass123',
                    id_number: 'encrypted:12345',
                    card6_digits: null,
                    nickname: 'My Card',
                    bank_account_number: null,
                    is_active: true,
                    created_at: '2024-01-01',
                    last_synced_at: null
                }]
            });

            await credentialsHandler({
                method: 'POST',
                query: {},
                body: {
                    vendor: 'visaCal',
                    username: 'user1',
                    password: 'pass123',
                    id_number: '12345',
                    nickname: 'My Card'
                }
            } as any, mockRes as any);

            // Verify encrypt was called for sensitive fields
            expect(encrypt).toHaveBeenCalledWith('user1');
            expect(encrypt).toHaveBeenCalledWith('pass123');
            expect(encrypt).toHaveBeenCalledWith('12345');

            // Verify SQL params contain encrypted values
            const [, params] = mockClient.query.mock.calls[0];
            expect(params[1]).toBe('encrypted:user1');   // username
            expect(params[2]).toBe('encrypted:pass123'); // password
            expect(params[3]).toBe('encrypted:12345');   // id_number
        });

        it('should return 400 when vendor is missing', async () => {
            await credentialsHandler({
                method: 'POST',
                query: {},
                body: { username: 'user', password: 'pass' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should handle optional fields as null', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1, vendor: 'max', username: null, password: null,
                    id_number: null, card6_digits: null, nickname: null,
                    bank_account_number: null, is_active: true, created_at: '2024-01-01',
                    last_synced_at: null
                }]
            });

            await credentialsHandler({
                method: 'POST',
                query: {},
                body: { vendor: 'max' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            // Encrypt should not be called for undefined fields
            expect(encrypt).not.toHaveBeenCalled();
        });
    });
});

describe('Credential by ID API (/api/credentials/[id])', () => {
    let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
    let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = { query: vi.fn(), release: vi.fn() };
        (getDB as any).mockResolvedValue(mockClient);
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /api/credentials/[id]', () => {
        it('should return decrypted credential including password for GET', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1,
                    vendor: 'visaCal',
                    username: 'encrypted:user1',
                    password: 'encrypted:secret',
                    id_number: null,
                    card6_digits: null,
                    nickname: 'My Card',
                    bank_account_number: null,
                    is_active: true,
                    created_at: '2024-01-01'
                }]
            });

            await credentialByIdHandler({
                method: 'GET', query: { id: '1' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const data = mockRes.json.mock.calls[0][0];
            expect(data.username).toBe('user1');
            // GET to individual credential DOES return password (for scraper use)
            expect(data.password).toBe('secret');
        });
    });

    describe('DELETE /api/credentials/[id]', () => {
        it('should delete a credential', async () => {
            mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

            await credentialByIdHandler({
                method: 'DELETE', query: { id: '1' }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true });
            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain('DELETE FROM vendor_credentials');
            expect(params).toEqual(['1']);
        });
    });

    describe('PATCH /api/credentials/[id]', () => {
        it('should toggle is_active', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1, vendor: 'visaCal', username: null, password: null,
                    id_number: null, card6_digits: null, nickname: 'Card',
                    bank_account_number: null, is_active: false, created_at: '2024-01-01'
                }]
            });

            await credentialByIdHandler({
                method: 'PATCH',
                query: { id: '1' },
                body: { is_active: false }
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain('SET is_active = $2');
            expect(params).toEqual(['1', false]);
        });

        it('should return 400 when is_active is not boolean', async () => {
            await credentialByIdHandler({
                method: 'PATCH',
                query: { id: '1' },
                body: { is_active: 'yes' }
            } as any, mockRes as any);

            // Validation catches this before hitting the DB
            expect(mockClient.query).not.toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('PUT /api/credentials/[id]', () => {
        it('should encrypt sensitive fields on update', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1, vendor: 'max', username: 'encrypted:newuser',
                    password: 'encrypted:newpass', id_number: null,
                    card6_digits: null, nickname: 'Updated Card',
                    bank_account_number: null, is_active: true, created_at: '2024-01-01'
                }]
            });

            await credentialByIdHandler({
                method: 'PUT',
                query: { id: '1' },
                body: {
                    vendor: 'max',
                    nickname: 'Updated Card',
                    username: 'newuser',
                    password: 'newpass'
                }
            } as any, mockRes as any);

            expect(encrypt).toHaveBeenCalledWith('newuser');
            expect(encrypt).toHaveBeenCalledWith('newpass');
            expect(mockRes.status).toHaveBeenCalledWith(200);

            // Password should NOT be returned in PUT response
            const data = mockRes.json.mock.calls[0][0];
            expect(data.password).toBeUndefined();
        });

        it('should not update password when not provided', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    id: 1, vendor: 'max', username: 'encrypted:user',
                    password: 'encrypted:oldpass', id_number: null,
                    card6_digits: null, nickname: 'Card',
                    bank_account_number: null, is_active: true, created_at: '2024-01-01'
                }]
            });

            await credentialByIdHandler({
                method: 'PUT',
                query: { id: '1' },
                body: { vendor: 'max', nickname: 'Card', username: 'user' }
            } as any, mockRes as any);

            const [sql] = mockClient.query.mock.calls[0];
            // Password should not appear in SET clause when not provided
            expect(sql).not.toContain('password =');
        });
    });

    describe('Validation', () => {
        it('should return 400 when id is missing', async () => {
            await credentialByIdHandler({
                method: 'GET', query: {}
            } as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should return 405 for unsupported methods', async () => {
            await credentialByIdHandler({
                method: 'POST', query: { id: '1' }
            } as any, mockRes as any);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Allow', ['DELETE', 'GET', 'PATCH', 'PUT']);
            expect(mockRes.status).toHaveBeenCalledWith(405);
        });
    });
});

describe('Credential Truncate API (/api/credentials/truncate/[id])', () => {
    let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
    let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = { query: vi.fn(), release: vi.fn() };
        (getDB as any).mockResolvedValue(mockClient);
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should delete transactions by vendor and nickname', async () => {
        // Account lookup
        mockClient.query.mockResolvedValueOnce({
            rows: [{ vendor: 'visaCal', nickname: 'MyCard', bank_account_number: null }]
        });
        // Delete with nickname
        mockClient.query.mockResolvedValueOnce({ rowCount: 42 });

        await truncateHandler({
            method: 'DELETE', query: { id: '1' }
        } as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        const data = mockRes.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        expect(data.deletedCount).toBe(42);

        // Verify DELETE query used vendor + nickname
        const [sql, params] = mockClient.query.mock.calls[1];
        expect(sql).toContain('WHERE vendor = $1 AND account_number = $2');
        expect(params).toEqual(['visaCal', 'MyCard']);
    });

    it('should not fall back to vendor-only delete when nickname match returns 0', async () => {
        mockClient.query.mockResolvedValueOnce({
            rows: [{ vendor: 'visaCal', nickname: 'OldNickname', bank_account_number: null }]
        });
        // Delete with nickname returns 0 — must NOT wipe other accounts of the same vendor
        mockClient.query.mockResolvedValueOnce({ rowCount: 0 });

        await truncateHandler({
            method: 'DELETE', query: { id: '1' }
        } as any, mockRes as any);

        expect(mockClient.query).toHaveBeenCalledTimes(2);
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json.mock.calls[0][0].deletedCount).toBe(0);
    });

    it('should delete by vendor only when no nickname', async () => {
        mockClient.query.mockResolvedValueOnce({
            rows: [{ vendor: 'max', nickname: null, bank_account_number: null }]
        });
        mockClient.query.mockResolvedValueOnce({ rowCount: 5 });

        await truncateHandler({
            method: 'DELETE', query: { id: '1' }
        } as any, mockRes as any);

        const [sql, params] = mockClient.query.mock.calls[1];
        expect(sql).toContain('WHERE vendor = $1');
        expect(sql).not.toContain('account_number');
        expect(params).toEqual(['max']);
    });

    it('should return 404 when account not found', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await truncateHandler({
            method: 'DELETE', query: { id: '999' }
        } as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return 405 for non-DELETE methods', async () => {
        await truncateHandler({
            method: 'GET', query: { id: '1' }
        } as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(405);
    });

    it('should return 400 when id is missing', async () => {
        await truncateHandler({
            method: 'DELETE', query: {}
        } as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on database error and release client', async () => {
        mockClient.query.mockRejectedValue(new Error('DB error'));

        await truncateHandler({
            method: 'DELETE', query: { id: '1' }
        } as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
});
