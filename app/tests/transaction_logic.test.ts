
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBillingCycleSql } from '../utils/transaction_logic';

// Mock dependencies for insertTransaction
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));
vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));
vi.mock('../pages/api/utils/transactionUtils.js', () => ({
    generateTransactionIdentifier: vi.fn().mockReturnValue('mock-tx-id')
}));

import { insertTransaction } from '../pages/api/utils/scraperUtils';

describe('Transaction Logic Tests', () => {

    describe('getBillingCycleSql', () => {
        it('should use inclusive >= for startDay', () => {
            const sql = getBillingCycleSql(10);
            expect(sql).toContain('>= 10');
            expect(sql).toContain('+ INTERVAL \'1 month\'');
        });
    });

    describe('Processing Date Logic in insertTransaction', () => {
        let mockClient: any;

        beforeEach(() => {
            mockClient = {
                query: vi.fn(),
                release: vi.fn()
            };
        });

        it('should set processed_date to previous month end if date > startDay', async () => {
            // Mock empty DB checks
            mockClient.query.mockResolvedValue({ rows: [] });

            const txDate = '2023-01-11T12:00:00.000Z'; // 11th Jan
            const tx = {
                date: txDate,
                processedDate: null, // explicit null to trigger logic
                chargedAmount: 100,
                description: 'test',
                identifier: 'id1',
                type: 'debit'
            };

            // Call with billingStartDay = 10
            await insertTransaction(
                mockClient,
                tx,
                'max',
                '1234',
                'ILS',
                [],
                false,
                {},
                false,
                10 // billingStartDay matches logic
            );

            // Find INSERT call
            const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
                call[0].includes('INSERT INTO transactions')
            );

            expect(insertCall).toBeDefined();
            const params = insertCall[1];
            // Param 8 is processed_date ($8)
            const processedDate = params[7]; // 0-indexed: index 7

            // Logic: 11 >= 10 -> True.
            // Date = Jan 11.
            // Next Month = Feb.
            // Day = BillingStartDay - 1 = 9.
            // Result: 2023-02-09

            expect(processedDate).toBe('2023-02-09');
        });

        it('should keep original date if date < startDay', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            const txDate = '2023-01-09T12:00:00.000Z'; // 9th Jan
            const tx = {
                date: txDate,
                processedDate: null,
                chargedAmount: 100,
                description: 'test',
                identifier: 'id2',
                type: 'debit'
            };

            await insertTransaction(mockClient, tx, 'max', '1234', 'ILS', [], false, {}, false, 10);

            const insertCall = mockClient.query.mock.calls.find((call: any[]) => call[0].includes('INSERT INTO transactions'));
            const processedDate = insertCall[1][7];

            // Logic: 9 >= 10 -> False.
            // processedDate = date (Jan 9)

            // Note: The logic inside insertTransaction:
            // let finalProcessedDate = processedDate || date;
            // if (...) { ... }
            // So default is date.

            // Date format in DB: 2023-01-09 (split T)
            expect(processedDate).toContain('2023-01-09');
        });

        it('should trigger logic if date == startDay', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            const txDate = '2023-01-10T12:00:00.000Z'; // 10th Jan
            const tx = {
                date: txDate,
                processedDate: null,
                chargedAmount: 100,
                description: 'test',
                identifier: 'id3',
                type: 'debit'
            };

            await insertTransaction(mockClient, tx, 'max', '1234', 'ILS', [], false, {}, false, 10);

            const insertCall = mockClient.query.mock.calls.find((call: any[]) => call[0].includes('INSERT INTO transactions'));
            const processedDate = insertCall[1][7];

            // Logic: 10 >= 10 -> True.
            // Result: 2023-02-09

            expect(processedDate).toBe('2023-02-09');
        });
    });
});
