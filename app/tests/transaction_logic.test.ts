
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
        it('should contain the core logic components', () => {
            const sql = getBillingCycleSql(10);
            expect(sql).toContain('>= 10');
            expect(sql).toContain('INTERVAL \'1 month\'');
        });

        it('should use previous month for processed_date on the startDay', () => {
            // New logic: processed_date on startDay belongs to startDay month (Current Month)
            // Correction: For Credit Card Charges (processed_date != date), if date is 10th (Start Day),
            // it usually pays for the PREVIOUS cycle. So strictly greater > 10 means Current.
            // 10 itself -> Previous.
            const sql = getBillingCycleSql(10, 't.date', 't.processed_date');
            expect(sql).toContain('WHEN t.processed_date IS NOT NULL AND t.processed_date != t.date');
            expect(sql).toContain('WHEN EXTRACT(DAY FROM t.processed_date) > 10');
            // logic is: > 10 -> processed_date (no interval)
            // <= 10 -> processed_date - 1 month
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
            // NOTE: insertTransaction logic in scraperUtils is about "When is the billing?"
            // It calculates "Processed Date" (Charge Date).
            // If date >= 10, charge is next month (Feb 9).
            // This logic is UNCHANGED because the bank actually charges next month.
            // Our SQL logic maps that "Feb 9" back to "Jan Cycle".

            // So we mock empty DB checks
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

            // Logic in scraperUtils (unchanged): 
            // 11 >= 10 -> True.
            // Date = Jan 11.
            // Next Month = Feb.
            // Day = BillingStartDay - 1 = 9.
            // Result: 2023-02-09

            expect(processedDate).toBe('2023-02-09');

            // This processed_date (Feb 9) will now be mapped by getBillingCycleSql to "2023-01"
            // (Feb 9 < 10 -> Previous Month -> Jan)
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
            expect(processedDate).toContain('2023-01-09');

            // This processed_date (Jan 9) will now be mapped by getBillingCycleSql to "2022-12"
            // (Jan 9 < 10 -> Previous Month -> Dec)
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
