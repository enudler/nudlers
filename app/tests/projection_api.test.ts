
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import handler from '../pages/api/reports/projection';

// Mock DB
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
    default: {
        error: vi.fn()
    }
}));

// Mock recurring detection
vi.mock('../../../utils/recurringDetection', () => ({
    detectRecurringPayments: vi.fn().mockReturnValue([])
}));

// Mock projection utils
vi.mock('../../../utils/projectionUtils', () => ({
    normalizeTransactionDates: vi.fn(),
    generateProjection: vi.fn().mockReturnValue([])
}));

describe('Projection API', () => {
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
            setHeader: vi.fn(),
            end: vi.fn()
        };

        mockReq = {
            method: 'GET',
            query: {}
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return 405 for non-GET methods', async () => {
        mockReq.method = 'POST';
        await handler(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(405);
        expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Method POST Not Allowed'));
    });

    it('should fetch data and generate projection', async () => {
        // Mock DB responses
        mockClient.query
            // 1. Accounts
            .mockResolvedValueOnce({ rows: [{ id: 1, account_number: '123', balance: 1000 }] })
            // 2. Bank Transactions
            .mockResolvedValueOnce({ rows: [] })
            // 3. Manual Recurring
            .mockResolvedValueOnce({ rows: [] })
            // 4. Future CC Payments
            .mockResolvedValueOnce({ rows: [] });

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            summary: expect.any(Object),
            projection: expect.any(Array),
            accounts: expect.any(Array),
            accountMetadata: expect.any(Object)
        }));
    });

    it('should handle database errors', async () => {
        mockClient.query.mockRejectedValue(new Error('DB Fail'));

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
    });
});
