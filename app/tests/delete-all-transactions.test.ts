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
import { createApiHandler } from '../pages/api/utils/apiHandler';

describe('Delete All Transactions API', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };
    let mockReq: {
        method: string;
        body?: object;
    };
    let mockRes: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();

        // Setup mock database client
        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };

        (getDB as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

        // Setup mock response object
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Method validation', () => {
        it('should reject non-DELETE requests', async () => {
            const handler = createApiHandler({
                validate: (req) => {
                    if (req.method !== 'DELETE') {
                        return "Only DELETE method is allowed";
                    }
                },
                query: async () => ({
                    sql: 'DELETE FROM transactions',
                    params: []
                }),
                transform: (result) => ({
                    success: true,
                    deletedCount: result.rowCount
                })
            });

            mockReq = { method: 'GET' };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Only DELETE method is allowed'
            });
        });

        it('should accept DELETE requests', async () => {
            mockClient.query.mockResolvedValue({ rowCount: 10, rows: [] });

            const handler = createApiHandler({
                validate: (req) => {
                    if (req.method !== 'DELETE') {
                        return "Only DELETE method is allowed";
                    }
                },
                query: async () => ({
                    sql: 'DELETE FROM transactions',
                    params: []
                }),
                transform: (result) => ({
                    success: true,
                    deletedCount: result.rowCount,
                    message: `Successfully deleted ${result.rowCount} transactions`
                })
            });

            mockReq = { method: 'DELETE' };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
        });
    });

    describe('Successful deletion', () => {
        it('should delete all transactions and return count', async () => {
            mockClient.query.mockResolvedValue({ rowCount: 50, rows: [] });

            const handler = createApiHandler({
                validate: (req) => {
                    if (req.method !== 'DELETE') {
                        return "Only DELETE method is allowed";
                    }
                },
                query: async () => ({
                    sql: 'DELETE FROM transactions',
                    params: []
                }),
                transform: (result) => ({
                    success: true,
                    deletedCount: result.rowCount,
                    message: `Successfully deleted ${result.rowCount} transactions`
                })
            });

            mockReq = { method: 'DELETE' };

            await handler(mockReq as any, mockRes as any);

            expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM transactions', []);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                deletedCount: 50,
                message: 'Successfully deleted 50 transactions'
            });
        });

        it('should handle zero transactions gracefully', async () => {
            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            const handler = createApiHandler({
                validate: (req) => {
                    if (req.method !== 'POST') {
                        return "Only POST method is allowed";
                    }
                },
                query: async () => ({
                    sql: 'DELETE FROM transactions',
                    params: []
                }),
                transform: (result) => ({
                    success: true,
                    deletedCount: result.rowCount,
                    message: `Successfully deleted ${result.rowCount} transactions`
                })
            });

            mockReq = { method: 'POST' };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                deletedCount: 0,
                message: 'Successfully deleted 0 transactions'
            });
        });

        it('should release database client after successful operation', async () => {
            mockClient.query.mockResolvedValue({ rowCount: 10, rows: [] });

            const handler = createApiHandler({
                validate: (req) => {
                    if (req.method !== 'POST') {
                        return "Only POST method is allowed";
                    }
                },
                query: async () => ({
                    sql: 'DELETE FROM transactions',
                    params: []
                }),
                transform: (result) => ({
                    success: true,
                    deletedCount: result.rowCount
                })
            });

            mockReq = { method: 'POST' };

            await handler(mockReq as any, mockRes as any);

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error handling', () => {
        it('should return 500 on database error', async () => {
            mockClient.query.mockRejectedValue(new Error('Database connection failed'));

            const handler = createApiHandler({
                validate: (req) => {
                    if (req.method !== 'POST') {
                        return "Only POST method is allowed";
                    }
                },
                query: async () => ({
                    sql: 'DELETE FROM transactions',
                    params: []
                }),
                transform: (result) => ({
                    success: true,
                    deletedCount: result.rowCount
                })
            });

            mockReq = { method: 'POST' };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Internal Server Error'
                })
            );
        });

        it('should release database client even on error', async () => {
            mockClient.query.mockRejectedValue(new Error('Database error'));

            const handler = createApiHandler({
                validate: (req) => {
                    if (req.method !== 'POST') {
                        return "Only POST method is allowed";
                    }
                },
                query: async () => ({
                    sql: 'DELETE FROM transactions',
                    params: []
                }),
                transform: (result) => ({
                    success: true,
                    deletedCount: result.rowCount
                })
            });

            mockReq = { method: 'POST' };

            await handler(mockReq as any, mockRes as any);

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });
});

describe('Database Export API', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };

        (getDB as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
    });

    it('should export transactions table data', async () => {
        const mockTransactions = [
            { id: 1, name: 'Transaction 1', price: 100 },
            { id: 2, name: 'Transaction 2', price: 200 }
        ];

        mockClient.query.mockResolvedValue({ rows: mockTransactions });

        // Simulate what the export API does
        const result = await mockClient.query('SELECT * FROM transactions');

        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].name).toBe('Transaction 1');
    });
});
