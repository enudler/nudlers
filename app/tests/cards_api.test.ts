import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

import { getDB } from '../pages/api/db';
import handler from '../pages/api/cards/index';

describe('Cards API Endpoint', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };
    let mockReq: any;
    let mockRes: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
        setHeader: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };

        (getDB as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

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

    describe('GET /api/cards', () => {
        it('should list cards and filter out bank accounts', async () => {
            mockReq = {
                method: 'GET'
            };
            mockClient.query.mockResolvedValue({
                rows: [
                    { last4_digits: '1234', transaction_count: 5, card_vendor: 'visa' },
                    { last4_digits: '5678', transaction_count: 10, card_vendor: 'mastercard' }
                ]
            });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const sql = mockClient.query.mock.calls[0][0];

            // Verify the SQL contains the filter for bank transactions
            expect(sql).toContain("transaction_type != 'bank'");
            expect(sql).toContain("transaction_type IS NULL");

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith([
                { last4_digits: '1234', transaction_count: 5, card_vendor: 'visa' },
                { last4_digits: '5678', transaction_count: 10, card_vendor: 'mastercard' }
            ]);
        });

        it('should handle errors gracefully', async () => {
            mockReq = { method: 'GET' };
            mockClient.query.mockRejectedValue(new Error('DB connection failed'));

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Internal Server Error'
            }));
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('POST /api/cards', () => {
        it('should save card vendor mapping', async () => {
            mockReq = {
                method: 'POST',
                body: {
                    last4_digits: '1234',
                    card_vendor: 'visa',
                    card_nickname: 'Main Card'
                }
            };
            mockClient.query.mockResolvedValue({
                rows: [{ last4_digits: '1234', card_vendor: 'visa', card_nickname: 'Main Card' }]
            });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            expect(mockClient.query.mock.calls[0][0]).toContain('INSERT INTO card_vendors');
            expect(mockClient.query.mock.calls[0][1]).toEqual(['1234', 'visa', 'Main Card']);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalled();
        });

        it('should return 400 if required fields are missing', async () => {
            mockReq = {
                method: 'POST',
                body: { last4_digits: '1234' } // missing card_vendor
            };

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'last4_digits and card_vendor are required' });
        });
    });

    describe('DELETE /api/cards', () => {
        it('should delete card vendor mapping', async () => {
            mockReq = {
                method: 'DELETE',
                body: { last4_digits: '1234' }
            };
            mockClient.query.mockResolvedValue({ rowCount: 1 });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            expect(mockClient.query.mock.calls[0][0]).toContain('DELETE FROM card_vendors');
            expect(mockClient.query.mock.calls[0][1]).toEqual(['1234']);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true });
        });
    });
});
