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
// Mock encryption to avoid env var requirement
vi.mock('../pages/api/utils/encryption', () => ({
    decrypt: vi.fn(),
    encrypt: vi.fn()
}));


import { getDB } from '../pages/api/db';
import handler from '../pages/api/transactions/index';

describe('Transactions API Endpoint', () => {
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
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Query Parameter Handling', () => {
        it('should list all transactions by default (no filters) within date range', async () => {
            mockReq = {
                method: 'GET',
                query: { startDate: '2023-01-01', endDate: '2023-01-31' }
            };
            mockClient.query.mockResolvedValue({
                rowCount: 0,
                rows: []
            });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const [sql, params] = mockClient.query.mock.calls[0];

            // Should NOT have WHERE clause for transaction_type
            expect(sql).not.toContain('transaction_type =');
            expect(sql).toContain('date >= $1::date');
            expect(sql).toContain('date <= $2::date');
            // Default limit 100, offset 0
            expect(params).toEqual(['2023-01-01', '2023-01-31', 100, 0]);
        });

        it('should filter by transactionType = bank', async () => {
            mockReq = {
                method: 'GET',
                query: { transactionType: 'bank', startDate: '2023-01-01', endDate: '2023-01-31' }
            };
            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain('transaction_type'); // logic uses complex query but checks for bank specific conditions
            // params: startDate, endDate, limit, offset. 
            // Bank filter logic is hardcoded in SQL conditions, it doesn't add params for 'bank' literal usually, 
            // unless logic changed.
            // Let's check logic: conditions.push(...). No params added for 'bank'.
            expect(params).toEqual(['2023-01-01', '2023-01-31', 100, 0]);
        });

        it('should filter by transactionType = credit_card', async () => {
            mockReq = {
                method: 'GET',
                query: { transactionType: 'credit_card', startDate: '2023-01-01', endDate: '2023-01-31' }
            };
            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];
            // Logic check: does it add params or just SQL?
            // checking implementation: conditions.push(...). No params added.
            expect(params).toEqual(['2023-01-01', '2023-01-31', 100, 0]);
        });

        it('should explicitly support transactionType = all', async () => {
            mockReq = {
                method: 'GET',
                query: { transactionType: 'all', startDate: '2023-01-01', endDate: '2023-01-31' }
            };
            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];
            // 'all' should result in no WHERE transaction_type clause
            expect(sql).not.toContain('transaction_type =');
            expect(params).toEqual(['2023-01-01', '2023-01-31', 100, 0]);
        });

        it('should filter by multiple parameters (vendor, dates)', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    vendor: 'visaCal',
                    startDate: '2023-01-01',
                    endDate: '2023-01-31'
                }
            };
            mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];

            // Check for presence of conditions
            expect(sql).toContain('date >= $1::date');
            expect(sql).toContain('date <= $2::date');
            expect(sql).toContain('vendor = $3');

            // Check params order
            expect(params).toEqual(['2023-01-01', '2023-01-31', 'visaCal', 100, 0]);
        });

        it('should validate invalid transactionType', async () => {
            mockReq = {
                method: 'GET',
                query: { transactionType: 'invalid_type' }
            };

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: "transactionType must be 'all', 'bank', or 'credit_card'"
            }));
        });
    });

    describe('Data Integrity (Response Format)', () => {
        // Mock data to simulate DB response
        const mockDbRows = [
            {
                identifier: 'tx1',
                vendor: 'hapoalim',
                date: '2023-01-15',
                name: 'Salary',
                price: 10000.00, // Positive for income
                category: 'Income',
                type: 'credit',
                processed_date: '2023-01-15',
                original_currency: 'ILS',
                installments_number: 0,
                installments_total: 0,
                transaction_type: 'bank'
            },
            {
                identifier: 'tx2',
                vendor: 'visaCal',
                date: '2023-01-10',
                name: 'Supermarket',
                price: -500.50, // Negative for expense
                category: 'Groceries',
                type: 'debit',
                processed_date: '2023-02-02', // Next month charge
                original_currency: 'ILS',
                installments_number: 2,
                installments_total: 3,
                transaction_type: 'credit_card'
            },
            {
                identifier: 'tx3',
                vendor: 'amex',
                date: '2023-01-05',
                name: 'Online Shop',
                price: -50.00,
                category: 'Shopping',
                type: 'debit',
                processed_date: '2023-02-02',
                original_currency: 'USD', // Foreign currency
                original_amount: -15.00,
                installments_number: 1,
                installments_total: 1,
                transaction_type: 'credit_card'
            }
        ];

        it('should correctly return signed amounts (positive/negative)', async () => {
            mockReq = { method: 'GET', query: { startDate: '2023-01-01', endDate: '2023-01-31' } };
            mockClient.query.mockResolvedValue({ rowCount: 3, rows: mockDbRows });

            await handler(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledTimes(1);
            const responseData = mockRes.json.mock.calls[0][0];

            // Verify Salary (Income)
            const salary = responseData.find((t: any) => t.identifier === 'tx1');
            expect(salary.price).toBe(10000.00);
            expect(salary.price).toBeGreaterThan(0);
            expect(salary.transaction_type).toBe('bank');

            // Verify Supermarket (Expense)
            const expense = responseData.find((t: any) => t.identifier === 'tx2');
            expect(expense.price).toBe(-500.50);
            expect(expense.price).toBeLessThan(0);
        });

        it('should correctly return installments info', async () => {
            mockReq = { method: 'GET', query: { startDate: '2023-01-01', endDate: '2023-01-31' } };
            mockClient.query.mockResolvedValue({ rowCount: 3, rows: mockDbRows });

            await handler(mockReq, mockRes);

            const responseData = mockRes.json.mock.calls[0][0];
            const installmentTx = responseData.find((t: any) => t.identifier === 'tx2');

            expect(installmentTx.installments_number).toBe(2);
            expect(installmentTx.installments_total).toBe(3);
        });

        it('should correctly return currency and processed dates', async () => {
            mockReq = { method: 'GET', query: { startDate: '2023-01-01', endDate: '2023-01-31' } };
            mockClient.query.mockResolvedValue({ rowCount: 3, rows: mockDbRows });

            await handler(mockReq, mockRes);

            const responseData = mockRes.json.mock.calls[0][0];

            // Check foreign transaction
            const foreignTx = responseData.find((t: any) => t.identifier === 'tx3');
            expect(foreignTx.original_currency).toBe('USD');
            expect(foreignTx.original_amount).toBe(-15.00);
            expect(foreignTx.processed_date).toBe('2023-02-02');

            // Check bank transaction date
            const bankTx = responseData.find((t: any) => t.identifier === 'tx1');
            expect(bankTx.processed_date).toBe('2023-01-15');
        });

        it('should release the client even if query fails', async () => {
            mockReq = { method: 'GET', query: { startDate: '2023-01-01', endDate: '2023-01-31' } };
            mockClient.query.mockRejectedValue(new Error('DB Error'));

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockClient.release).toHaveBeenCalled();
        });
    });
});
