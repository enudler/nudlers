
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import handler from '../pages/api/reports/budget-vs-actual';

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

// Mock getBillingCycleSql if needed, or rely on implementation if it's pure logic
// Since it's imported from utils/transaction_logic, we might want to mock it or let it run.
// Looking at the file, it imports { getBillingCycleSql } from "../../../utils/transaction_logic";
// It's probably better to let it run if it's a pure function, or mock it if it's complex.
// Let's assume it works or we can mock it.
// For integration safety, I'll mock the import to control the SQL it generates.
vi.mock('../../../utils/transaction_logic', () => ({
    getBillingCycleSql: vi.fn().mockReturnValue('mocked_date_logic = $1')
}));

describe('Budget VS Actual API', () => {
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
    });

    it('should return 400 if required params are missing', async () => {
        mockReq.query = {}; // Missing cycle/dates
        await handler(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining("required")
        }));
    });

    it('should generate report successfully for a billing cycle', async () => {
        mockReq.query = { billingCycle: '2023-01' };

        // Mocks for ensureTotalBudgetTable (1 call), billing start day (1 call)
        mockClient.query
            .mockResolvedValueOnce({}) // create table
            .mockResolvedValueOnce({ rows: [{ value: '10' }] }); // billing day

        // Promise.all mocks:
        // 1. actualResult
        // 2. budgetsResult
        // 3. totalBudgetResult
        mockClient.query
            .mockResolvedValueOnce({
                rows: [
                    { category: 'Food', actual_spent: '100' },
                    { category: 'Transport', actual_spent: '50' }
                ]
            }) // actuals
            .mockResolvedValueOnce({
                rows: [
                    { id: 1, category: 'Food', budget_limit: '200' },
                    { id: 2, category: 'Rent', budget_limit: '1000' }
                ]
            }) // budgets
            .mockResolvedValueOnce({
                rows: [{ budget_limit: '2000' }]
            }); // total budget

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        const response = mockRes.json.mock.calls[0][0];

        expect(response.cycle).toBe('2023-01');

        // Check categories merging
        // Food: actual 100, budget 200 -> remaining 100
        const food = response.categories.find((c: any) => c.category === 'Food');
        expect(food).toBeDefined();
        expect(food.actual_spent).toBe(100);
        expect(food.budget_limit).toBe(200);
        expect(food.remaining).toBe(100);

        // Transport: actual 50, no budget -> remaining -50 (budget 0)
        const transport = response.categories.find((c: any) => c.category === 'Transport');
        expect(transport).toBeDefined();
        expect(transport.budget_limit).toBe(0);
        expect(transport.actual_spent).toBe(50);
        // Logic check: remaining = budget - actual = 0 - 50 = -50
        expect(transport.remaining).toBe(-50);

        // Rent: actual 0, budget 1000 -> remaining 1000
        const rent = response.categories.find((c: any) => c.category === 'Rent');
        expect(rent).toBeDefined();
        expect(rent.actual_spent).toBe(0);
        expect(rent.remaining).toBe(1000);

        // Check totals
        // Total Budget: 200 + 1000 = 1200
        // Total Actual: 100 + 50 = 150
        expect(response.totals.budget).toBe(1200);
        expect(response.totals.actual).toBe(150);
    });

    it('should handle date range queries', async () => {
        mockReq.query = { startDate: '2023-01-01', endDate: '2023-01-31' };

        // Mocks for ensure table, settings
        mockClient.query
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({ rows: [] }); // default 10

        // Promise.all mocks
        mockClient.query
            .mockResolvedValueOnce({ rows: [] }) // actuals
            .mockResolvedValueOnce({ rows: [] }) // budgets
            .mockResolvedValueOnce({ rows: [] }); // total budget

        await handler(mockReq, mockRes);

        const actualQuery = mockClient.query.mock.calls[2][0]; // 0=ensure, 1=settings, 2=actuals
        expect(actualQuery).toContain('date >= $1 AND date <= $2');
    });

    it('should handle database errors', async () => {
        mockReq.query = { billingCycle: '2023-01' };
        mockClient.query.mockRejectedValue(new Error('DB Error'));

        await handler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(500);
    });
});
