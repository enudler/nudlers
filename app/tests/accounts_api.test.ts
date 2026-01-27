import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import handler from '../pages/api/accounts/index';

// Mock the database module
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

describe('Accounts API Endpoint', () => {
    let mockClient: any;
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };

        (getDB as any).mockResolvedValue(mockClient);

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn().mockReturnThis(),
            end: vi.fn().mockReturnThis()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /api/accounts', () => {
        it('should return a list of accounts with balances', async () => {
            mockReq = {
                method: 'GET'
            };

            const mockRows = [
                {
                    id: 1,
                    vendor: 'hapoalim',
                    account_number: '123456',
                    balance: 5000.5,
                    balance_updated_at: '2023-01-01T10:00:00Z',
                    credential_nickname: 'Main Bank',
                    credential_vendor: 'hapoalim',
                    custom_bank_account_nickname: null,
                    mapped_card_nickname: null,
                    mapped_card_vendor: null,
                    credential_id: 10,
                    linked_bank_account_id: null,
                    custom_bank_account_number: null
                }
            ];

            mockClient.query.mockResolvedValue({
                rows: mockRows,
                rowCount: 1
            });

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response).toHaveLength(1);
            expect(response[0]).toMatchObject({
                id: 1,
                vendor: 'hapoalim',
                balance: 5000.5,
                nickname: 'Main Bank',
                last4: '3456'
            });
        });
    });
});
