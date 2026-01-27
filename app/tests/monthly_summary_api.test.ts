import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import handler from '../pages/api/reports/monthly-summary';

// Mock the database module
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn(),
    pool: {
        connect: vi.fn(),
        query: vi.fn(),
        on: vi.fn(),
    }
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

// Mock the transaction_logic
vi.mock('../utils/transaction_logic', () => ({
    getBillingCycleSql: vi.fn(() => 'mock_billing_sql')
}));

describe('Monthly Summary API Endpoint', () => {
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

    describe('Bank Transactions Filtering', () => {
        it('should exclude bank transactions when excludeBankTransactions is true', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                    groupBy: 'description',
                    excludeBankTransactions: 'true'
                }
            };

            mockClient.query.mockResolvedValue({
                rowCount: 0,
                rows: []
            });

            await handler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const [sql] = mockClient.query.mock.calls[0];

            // Should exclude bank vendors
            expect(sql).toContain('t.vendor NOT IN');
            expect(sql).toContain('\'hapoalim\'');
            expect(sql).toContain('\'leumi\'');

            // IMPORTANT: Should NOT contain category filtering (user requirement)
            expect(sql).not.toContain('category NOT IN');
            expect(sql).not.toContain('\'Mortgage\'');
            expect(sql).not.toContain('\'משכנתא\'');
        });

        it('should NOT exclude bank transactions when excludeBankTransactions is false', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                    groupBy: 'description',
                    excludeBankTransactions: 'false'
                }
            };

            mockClient.query.mockResolvedValue({
                rowCount: 0,
                rows: []
            });

            await handler(mockReq, mockRes);

            const [sql] = mockClient.query.mock.calls[0];

            expect(sql).not.toContain('t.vendor NOT IN (\'hapoalim\'');
        });
    });

    describe('Pagination', () => {
        it('should include LIMIT and OFFSET in the SQL with default values', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                    groupBy: 'description'
                }
            };

            mockClient.query.mockResolvedValue({
                rowCount: 0,
                rows: []
            });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];
            // StartDate/EndDate are $1/$2, so LIMIT/OFFSET are $3/$4
            expect(sql).toContain('ORDER BY ABS(COALESCE(SUM(t.price), 0)) DESC, t.name ASC');
            expect(sql).toContain('LIMIT $3 OFFSET $4');
            expect(params).toContain(50);
            expect(params).toContain(0);
        });

        it('should use provided limit and offset values', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                    groupBy: 'description',
                    limit: '20',
                    offset: '40'
                }
            };

            mockClient.query.mockResolvedValue({
                rowCount: 1,
                rows: [{ description: 'Test', total_count: 100 }]
            });

            await handler(mockReq, mockRes);

            const [sql, params] = mockClient.query.mock.calls[0];
            expect(sql).toContain('LIMIT $3 OFFSET $4');
            expect(params).toContain(20);
            expect(params).toContain(40);

            // Verify response format
            expect(mockRes.json).toHaveBeenCalledWith({
                items: [{ description: 'Test' }],
                total: 100
            });
        });
    });

    describe('Balance and Nicknames', () => {
        it('should return balance and fallback nicknames', async () => {
            mockReq = {
                method: 'GET',
                query: {
                    groupBy: 'last4digits',
                    startDate: '2023-01-01',
                    endDate: '2023-01-31',
                }
            };

            const mockRow = {
                last4digits: '1234',
                transaction_count: 5,
                bank_income: 1000,
                bank_expenses: 500,
                card_expenses: 200,
                total_income: 1000,
                total_outflow: 700,
                net_balance: 300,
                bank_account_id: 1,
                bank_account_nickname: 'My Bank',
                bank_account_number: '123456',
                bank_account_vendor: 'hapoalim',
                transaction_vendor: 'hapoalim',
                balance: 5000,
                balance_updated_at: '2023-01-27T20:00:00Z',
                total_count: 1
            };

            mockClient.query.mockResolvedValue({
                rowCount: 1,
                rows: [mockRow]
            });

            await handler(mockReq, mockRes);

            const [sql] = mockClient.query.mock.calls[0];
            expect(sql).toContain('co.balance');
            expect(sql).toContain('co.balance_updated_at');
            expect(sql).toContain('COALESCE(ba.id, vc.id)');

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                items: expect.arrayContaining([
                    expect.objectContaining({
                        balance: 5000,
                        balance_updated_at: '2023-01-27T20:00:00Z'
                    })
                ])
            }));
        });
    });
});
