import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import syncStatusHandler from '../pages/api/sync_status';

// Mock the database module
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

describe('API: /api/sync_status', () => {
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
            setHeader: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return 405 for non-GET requests', async () => {
        mockReq = { method: 'POST' };
        await syncStatusHandler(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(405);
    });

    it('should include credential ID in accountSyncStatus', async () => {
        mockReq = { method: 'GET' };

        // Mock settings Result
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { key: 'sync_enabled', value: 'true' },
                { key: 'sync_hour', value: '3' },
                { key: 'sync_days_back', value: '30' }
            ]
        });

        // Mock active accounts count
        mockClient.query.mockResolvedValueOnce({
            rows: [{ count: '1' }]
        });

        // Mock latest scrape
        mockClient.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                status: 'completed',
                created_at: new Date().toISOString()
            }]
        });

        // Mock history
        mockClient.query.mockResolvedValueOnce({
            rows: []
        });

        // Mock accountSyncStatus - THIS IS WHAT WE WANT TO TEST
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { id: 123, nickname: 'Test Account', vendor: 'isracard', last_synced_at: '2023-01-01T10:00:00.000000Z' }
            ]
        });

        await syncStatusHandler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        const responseData = mockRes.json.mock.calls[0][0];

        expect(responseData.accountSyncStatus).toHaveLength(1);
        expect(responseData.accountSyncStatus[0]).toHaveProperty('id', 123);
        expect(responseData.accountSyncStatus[0]).toHaveProperty('nickname', 'Test Account');
    });

    it('should handle cancelled status as healthy', async () => {
        mockReq = { method: 'GET' };

        // Mock settings
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        // Mock counts
        mockClient.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });

        // Mock latest scrape with 'cancelled' status
        mockClient.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                status: 'cancelled',
                created_at: new Date().toISOString()
            }]
        });

        // Mock history and account status
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await syncStatusHandler(mockReq, mockRes);

        const responseData = mockRes.json.mock.calls[0][0];
        expect(responseData.syncHealth).toBe('healthy');
    });
});
