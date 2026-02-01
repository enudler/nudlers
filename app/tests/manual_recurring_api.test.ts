
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import handler from '../pages/api/finance/recurring';

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

describe('Manual Recurring Payments API', () => {
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
            json: vi.fn().mockReturnThis()
        };

        mockReq = {
            query: {},
            body: {}
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET', () => {
        it('should return list of recurring payments', async () => {
            mockReq.method = 'GET';
            mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test' }] });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM manual_recurring_payments'));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith([{ id: 1, name: 'Test' }]);
        });
    });

    describe('POST', () => {
        it('should create new payment', async () => {
            mockReq.method = 'POST';
            mockReq.body = {
                name: 'Rent',
                amount: 1000,
                category: 'Housing',
                account_number: '1234',
                day_of_month: 1
            };

            mockClient.query.mockResolvedValueOnce({ rows: [mockReq.body] });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO manual_recurring_payments'),
                expect.arrayContaining(['Rent', 1000, 1])
            );
            expect(mockRes.status).toHaveBeenCalledWith(201);
        });

        it('should validate required fields', async () => {
            mockReq.method = 'POST';
            mockReq.body = { name: 'Rent' }; // Missing amount etc

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
        });
    });

    describe('PATCH', () => {
        it('should update payment status', async () => {
            mockReq.method = 'PATCH';
            mockReq.body = { id: 1, is_active: false };

            mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1, is_active: false }] });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE manual_recurring_payments'),
                [false, 1]
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should require id', async () => {
            mockReq.method = 'PATCH';
            mockReq.body = { is_active: false };

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('DELETE', () => {
        it('should delete payment', async () => {
            mockReq.method = 'DELETE';
            mockReq.query = { id: 1 };

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM manual_recurring_payments'),
                [1]
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should require id', async () => {
            mockReq.method = 'DELETE';
            mockReq.query = {};

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    it('should return 405 for unknown method', async () => {
        mockReq.method = 'PUT';
        await handler(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(405);
    });

    it('should handle errors', async () => {
        mockReq.method = 'GET';
        mockClient.query.mockRejectedValue(new Error('DB Fail'));

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(500);
    });
});
