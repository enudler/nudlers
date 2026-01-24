import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processScrapedAccounts } from '../pages/api/utils/scraperUtils';

// Mock the database module
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock transactionUtils
vi.mock('../pages/api/utils/transactionUtils.js', () => ({
    generateTransactionIdentifier: vi.fn().mockReturnValue('mock-tx-id')
}));

describe('Scrape Report Installments', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [] }),
            release: vi.fn()
        };
    });

    it('should include installment information in processedTransactions report items', async () => {
        const accounts = [
            {
                accountNumber: '1234',
                txns: [
                    {
                        date: '2023-01-01',
                        description: 'Installment Purchase',
                        originalAmount: 1200,
                        chargedAmount: 100,
                        installments: {
                            number: 3,
                            total: 12
                        },
                        status: 'completed',
                        identifier: 'tx1'
                    }
                ]
            }
        ];

        // Mock history fetch
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // category_categories check
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // history fetch
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // transaction BEGIN
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // checkCardOwnership
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // claimCardOwnership
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // insertTransaction - identifier check
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // insertTransaction - business key check
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // insertTransaction - INSERT
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // transaction COMMIT

        const stats = await processScrapedAccounts({
            client: mockClient,
            accounts,
            companyId: 'max',
            credentialId: 1,
            categorizationRules: [],
            categoryMappings: {},
            billingCycleStartDay: 10,
            updateCategoryOnRescrape: false,
            isBank: false
        });

        expect(stats.processedTransactions.length).toBe(1);
        const item = stats.processedTransactions[0];
        expect(item.installmentsNumber).toBe(3);
        expect(item.installmentsTotal).toBe(12);
        expect(item.totalAmount).toBe(1200);
        expect(item.amount).toBe(100);
    });
});
