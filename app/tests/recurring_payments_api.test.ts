import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import handler from '../pages/api/reports/recurring-payments';

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

describe('Recurring Payments API', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };
    let mockReq: any;
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

        mockReq = {
            method: 'GET',
            query: {} // Default empty query params
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should query for active installments and candidate recurring transactions', async () => {
        // Setup mock responses for the two queries
        mockClient.query
            .mockResolvedValueOnce({ rows: [] }) // installmentsResult
            .mockResolvedValueOnce({ rows: [] }); // candidatesResult

        await handler(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledTimes(2);

        // Check first query - looking for installments > 1
        const installmentsQuery = mockClient.query.mock.calls[0][0];
        expect(installmentsQuery).toContain('installments_total > 1');

        // Check second query - looking for recurring candidates
        const candidatesQuery = mockClient.query.mock.calls[1][0];
        expect(candidatesQuery).toContain('t.installments_total IS NULL OR t.installments_total <= 1');
    });

    it('should only query installments when type=installments', async () => {
        mockReq.query = { type: 'installments' };
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await handler(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledTimes(1);
        const query = mockClient.query.mock.calls[0][0];
        expect(query).toContain('installments_total > 1');
    });

    it('should only query recurring when type=recurring', async () => {
        mockReq.query = { type: 'recurring' };
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await handler(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledTimes(1);
        const query = mockClient.query.mock.calls[0][0];
        expect(query).toContain('t.installments_total IS NULL OR t.installments_total <= 1');
    });

    it('should exclude transactions that match known installment names', async () => {
        mockClient.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        await handler(mockReq, mockRes);

        const candidatesQuery = mockClient.query.mock.calls[1][0];

        // Verify the specific exclusion logic we added
        expect(candidatesQuery).toContain('WITH known_installments AS');
        expect(candidatesQuery).toContain('SELECT DISTINCT LOWER(TRIM(name)) as name');
        expect(candidatesQuery).toContain('FROM transactions');
        expect(candidatesQuery).toContain('WHERE installments_total > 1');

        // Verify the exclusion clause
        expect(candidatesQuery).toContain('AND LOWER(TRIM(t.name)) NOT IN (SELECT name FROM known_installments)');
    });

    it('should return successfully with formatted response including pagination', async () => {
        const mockInstallments = [{ name: 'Sofa', price: -500, total_count: '1' }];
        const mockCandidates = [
            { name: 'Netflix', price: -50, date: '2023-01-01' },
            { name: 'Netflix', price: -50, date: '2023-02-01' },
            { name: 'Netflix', price: -50, date: '2023-03-01' }
        ];

        mockClient.query
            .mockResolvedValueOnce({ rows: mockInstallments })
            .mockResolvedValueOnce({ rows: mockCandidates });

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            installments: expect.any(Array),
            recurring: expect.arrayContaining([
                expect.objectContaining({ name: 'Netflix', frequency: 'monthly' })
            ]),
            pagination: expect.objectContaining({
                limit: expect.any(Number),
                offset: expect.any(Number),
                totalInstallments: expect.any(Number),
                totalRecurring: expect.any(Number),
                total: expect.any(Number)
            })
        }));
    });

    it('should apply status filter for installments', async () => {
        mockReq.query = { type: 'installments', status: 'active' };
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await handler(mockReq, mockRes);

        const query = mockClient.query.mock.calls[0][0];
        expect(query).toContain('installments_number < installments_total');
    });

    it('should apply frequency filter for recurring', async () => {
        mockReq.query = { type: 'recurring', frequency: 'monthly' };
        mockClient.query.mockResolvedValueOnce({ rows: [
            { name: 'Netflix', price: -50, date: '2023-01-01' },
            { name: 'Netflix', price: -50, date: '2023-02-01' },
            { name: 'Netflix', price: -50, date: '2023-03-01' },
            { name: 'BiMonthly', price: -100, date: '2023-01-01' },
            { name: 'BiMonthly', price: -100, date: '2023-03-01' }
        ] });

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        const response = mockRes.json.mock.calls[0][0];
        // All returned recurring items should be monthly (bi-monthly filtered out)
        response.recurring.forEach((item: any) => {
            expect(item.frequency).toBe('monthly');
        });
    });

    it('should handle database errors gracefully', async () => {
        mockClient.query.mockRejectedValue(new Error('DB Connection Failed'));

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            error: 'Internal Server Error',
            details: 'DB Connection Failed'
        }));
        expect(mockClient.release).toHaveBeenCalled();
    });
});
