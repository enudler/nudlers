import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import handler from '../pages/api/reports/non-recurring-exclusions';

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

describe('Non-Recurring Exclusions API', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };
    let mockRes: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
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
            json: vi.fn().mockReturnThis()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /api/reports/non-recurring-exclusions', () => {
        it('should return all exclusions', async () => {
            const mockExclusions = [
                { id: 1, name: 'One-time Purchase', account_number: null, created_at: '2024-01-01' },
                { id: 2, name: 'Annual Payment', account_number: '1234', created_at: '2024-01-02' }
            ];

            mockClient.query.mockResolvedValueOnce({ rows: mockExclusions });

            const mockReq = { method: 'GET' };
            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                exclusions: mockExclusions,
                total: 2
            });
        });

        it('should return empty array when no exclusions exist', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [] });

            const mockReq = { method: 'GET' };
            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                exclusions: [],
                total: 0
            });
        });
    });

    describe('POST /api/reports/non-recurring-exclusions', () => {
        it('should create a new exclusion', async () => {
            const newExclusion = {
                id: 1,
                name: 'Netflix',
                account_number: null,
                created_at: '2024-01-01'
            };

            mockClient.query.mockResolvedValueOnce({ rows: [newExclusion] });

            const mockReq = {
                method: 'POST',
                body: { name: 'Netflix' }
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Marked as non-recurring',
                exclusion: newExclusion
            });
        });

        it('should create exclusion with account_number', async () => {
            const newExclusion = {
                id: 1,
                name: 'Netflix',
                account_number: '1234',
                created_at: '2024-01-01'
            };

            mockClient.query.mockResolvedValueOnce({ rows: [newExclusion] });

            const mockReq = {
                method: 'POST',
                body: { name: 'Netflix', account_number: '1234' }
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO non_recurring_exclusions'),
                ['Netflix', '1234']
            );
            expect(mockRes.status).toHaveBeenCalledWith(201);
        });

        it('should return success when exclusion already exists', async () => {
            // ON CONFLICT DO NOTHING returns no rows
            mockClient.query.mockResolvedValueOnce({ rows: [] });

            const mockReq = {
                method: 'POST',
                body: { name: 'Netflix' }
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Already marked as non-recurring',
                alreadyExisted: true
            });
        });

        it('should return 400 when name is missing', async () => {
            const mockReq = {
                method: 'POST',
                body: {}
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'name is required' });
        });

        it('should trim whitespace from name', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Netflix', account_number: null }] });

            const mockReq = {
                method: 'POST',
                body: { name: '  Netflix  ' }
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                ['Netflix', null]
            );
        });
    });

    describe('DELETE /api/reports/non-recurring-exclusions', () => {
        it('should delete an existing exclusion', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

            const mockReq = {
                method: 'DELETE',
                body: { name: 'Netflix' }
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Unmarked as non-recurring'
            });
        });

        it('should delete exclusion with specific account_number', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

            const mockReq = {
                method: 'DELETE',
                body: { name: 'Netflix', account_number: '1234' }
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM non_recurring_exclusions'),
                ['Netflix', '1234']
            );
        });

        it('should return 404 when exclusion not found', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [] });

            const mockReq = {
                method: 'DELETE',
                body: { name: 'Nonexistent' }
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                message: 'Exclusion not found'
            });
        });

        it('should return 400 when name is missing', async () => {
            const mockReq = {
                method: 'DELETE',
                body: {}
            };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'name is required' });
        });
    });

    describe('Error Handling', () => {
        it('should return 405 for unsupported methods', async () => {
            const mockReq = { method: 'PUT' };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(405);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
        });

        it('should handle database errors gracefully', async () => {
            mockClient.query.mockRejectedValue(new Error('DB Connection Failed'));

            const mockReq = { method: 'GET' };

            await handler(mockReq as any, mockRes as any);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Internal Server Error',
                details: 'DB Connection Failed'
            }));
            expect(mockClient.release).toHaveBeenCalled();
        });
    });
});
