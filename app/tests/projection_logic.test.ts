
import { normalizeTransactionDates } from '../utils/projectionUtils';
import { describe, it, expect } from 'vitest';

describe('normalizeTransactionDates', () => {
    it('should cluster transactions within 2 days for the same card', () => {
        interface Transaction {
            account_number: string;
            vendor: string;
            last4: string;
            processed_date: string;
            normalizedDate?: Date;
        }

        const transactions: Transaction[] = [
            {
                account_number: '123', vendor: 'Visa', last4: '1111',
                processed_date: '2025-02-01T00:00:00.000Z'
            },
            {
                account_number: '123', vendor: 'Visa', last4: '1111',
                processed_date: '2025-02-02T00:00:00.000Z'
            },
            {
                account_number: '123', vendor: 'Visa', last4: '1111',
                processed_date: '2025-02-03T00:00:00.000Z'
            }
        ];

        normalizeTransactionDates(transactions);

        const t0 = transactions[0].normalizedDate!.getTime();
        const t1 = transactions[1].normalizedDate!.getTime();
        const t2 = transactions[2].normalizedDate!.getTime();

        expect(t0).toBe(t1);
        expect(t1).toBe(t2);

        // Tie break is earliest, so it should be Feb 1st
        const expected = new Date('2025-02-01T00:00:00.000Z');
        expected.setHours(0, 0, 0, 0);
        expect(t0).toBe(expected.getTime());
    });

    it('should pick most frequent date in cluster', () => {
        const transactions: any[] = [
            { processed_date: '2025-02-01' },
            { processed_date: '2025-02-02' },
            { processed_date: '2025-02-02' }
        ].map(t => ({ ...t, account_number: '1', vendor: 'v', last4: '1' }));

        normalizeTransactionDates(transactions);

        const t0 = transactions[0].normalizedDate.getTime();
        const t1 = transactions[1].normalizedDate.getTime();

        expect(t0).toBe(t1);

        // Should be Feb 2nd (most frequent)
        const d2 = new Date('2025-02-02');
        d2.setHours(0, 0, 0, 0);
        expect(t0).toBe(d2.getTime());
    });

    it('should separate clusters > 2 days apart', () => {
        const transactions: any[] = [
            { processed_date: '2025-02-01' },
            { processed_date: '2025-02-10' }
        ].map(t => ({ ...t, account_number: '1', vendor: 'v', last4: '1' }));

        normalizeTransactionDates(transactions);

        expect(transactions[0].normalizedDate.getTime()).not.toBe(transactions[1].normalizedDate.getTime());
    });

    it('should handle different cards independently', () => {
        const transactions: any[] = [
            {
                account_number: '123', vendor: 'Visa', last4: '1111',
                processed_date: '2025-02-01'
            },
            {
                account_number: '123', vendor: 'Visa', last4: '2222', // Different card
                processed_date: '2025-02-02'
            }
        ];

        normalizeTransactionDates(transactions);

        const t0 = transactions[0].normalizedDate;
        const t1 = transactions[1].normalizedDate;

        // They should remain distinct because they are different cards, so different groups
        const d1 = new Date('2025-02-01'); d1.setHours(0, 0, 0, 0);
        const d2 = new Date('2025-02-02'); d2.setHours(0, 0, 0, 0);

        expect(t0.getTime()).toBe(d1.getTime());
        expect(t1.getTime()).toBe(d2.getTime());
    });
});
