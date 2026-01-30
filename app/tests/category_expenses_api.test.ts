
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

vi.mock('../pages/api/utils/encryption', () => ({
    decrypt: vi.fn((val) => `decrypted_${val}`)
}));

vi.mock('../utils/transaction_logic', () => ({
    getBillingCycleSql: vi.fn((startDay, dateCol, processedDateCol) => `mock_billing_cycle_sql(${startDay}, ${dateCol}, ${processedDateCol})`)
}));


import { getDB } from '../pages/api/db';
import handler from '../pages/api/reports/category-expenses';


describe('Category Expenses API', () => {
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
        (getDB as any).mockResolvedValue(mockClient);

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Validation', () => {
        it('should return 400 if no time parameters provided', async () => {
            mockReq = {
                method: 'GET',
                query: { category: 'Food' }
            };

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: "Either month, billingCycle, or both startDate and endDate parameters are required" });
        });

        it('should return 400 if category missing and all!=true', async () => {
            mockReq = {
                method: 'GET',
                query: { startDate: '2023-01-01', endDate: '2023-01-31' }
            };

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: "Either category or all=true is required" });
        });
    });

    describe('Query Logic', () => {
        it('should query all transactions within date range', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                    all: 'true'
                }
            };

            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];

            expect(sql).toContain('t.date >= $1::date');
            expect(sql).toContain('t.date <= $2::date');
            expect(params).toEqual(['2023-01-01', '2023-01-31', 50, 0]);
        });

        it('should query all transactions with billingCycle', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    billingCycle: '2023-01',
                    all: 'true'
                }
            };

            // Mock settings query for billing cycle start day
            mockClient.query
                .mockResolvedValueOnce({ rows: [{ value: '10' }] }) // settings
                .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // transactions

            await handler(mockReq, mockRes);

            // Verify settings query
            expect(mockClient.query).toHaveBeenNthCalledWith(1, "SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");

            // Verify main query, expecting parentheses around the function call as per implementation
            const [sql, params] = mockClient.query.mock.calls[1];
            expect(sql).toContain('(mock_billing_cycle_sql(10, t.date, t.processed_date)) = $1');
            expect(params).toEqual(['2023-01', 50, 0]);
        });

        it('should query specific category with date range', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                    category: 'Food'
                }
            };

            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain('t.category = $3');
            expect(params).toEqual(['2023-01-01', '2023-01-31', 'Food', 50, 0]);
        });

        it('should query with legacy month parameter if provided', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    month: '2023-01',
                    category: 'Food'
                }
            };

            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain("TO_CHAR(t.date, 'YYYY-MM') = $1");
            expect(params).toEqual(['2023-01', 'Food', 50, 0]);
        });

        it('should decrypt card digits in response', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                    all: 'true'
                }
            };

            const mockRows = [
                { name: 'Tx1', card6_digits_encrypted: 'encrypted123456' }
            ];
            mockClient.query.mockResolvedValue({ rowCount: 1, rows: mockRows });

            await handler(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledTimes(1);
            const data = mockRes.json.mock.calls[0][0];
            expect(data[0].card6_digits).toBe('decrypted_encrypted123456');
            expect(data[0].card6_digits_encrypted).toBeUndefined();
        });
    });
});
