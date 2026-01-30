import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../pages/api/reports/projection';
import { getDB } from '../pages/api/db';
import { detectRecurringPayments } from '../utils/recurringDetection';

vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

vi.mock('../utils/recurringDetection', () => ({
    detectRecurringPayments: vi.fn()
}));

vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

describe('Projection API', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };
        (getDB as any).mockResolvedValue(mockClient);
        (detectRecurringPayments as any).mockReturnValue([]);
    });

    it('should calculate projected balances correctly', async () => {
        // 1. Mock settings
        mockClient.query.mockResolvedValueOnce({ rows: [{ value: '10' }] });

        // 2. Mock bank accounts
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { id: 1, vendor: 'hapoalim', account_number: '123', balance: 10000, nickname: 'Main Bank', credential_id: 1 }
            ]
        });

        // 3. Mock credit cards
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { vendor: 'visaCal', account_number: '4567', linked_bank_account_id: 1, nickname: 'My Visa' }
            ]
        });

        // 4. Mock transactions for target month
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { vendor: 'visaCal', account_number: '12344567', price: -500, date: '2026-01-15', name: 'Some Store' }
            ]
        });

        // 5. Mock candidates for recurring detection
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        // 6. Mock recurring detection result
        (detectRecurringPayments as any).mockReturnValue([
            {
                name: 'Netflix',
                vendor: 'visaCal',
                account_number: '4567',
                price: -50,
                next_payment_date: new Date('2026-02-01')
            }
        ]);

        const req = { query: {} } as any;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        } as any;

        await handler(req, res);



        expect(res.status).toHaveBeenCalledWith(200);
        const data = res.json.mock.calls[0][0];

        // Check if projection includes 10000 - 500 (CC) - 50 (Recurring) = 9450
        // Actually, in the test, today is mocked by real Date.
        // If today is Jan 30, targetMonth is Feb.
        // Recurring Netflix is Feb 1, so it should be included.
        // CC deduction is 500.

        expect(data.items[0].currentBalance).toBe(10000);
        expect(data.items[0].projectedCreditCardDeduction).toBe(-500);
        expect(data.items[0].projectedRecurringDeduction).toBe(-50);
        expect(data.items[0].projectedBalance).toBe(9450);
    });
});
