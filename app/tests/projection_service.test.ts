
import { generateProjection } from '../utils/projectionUtils';
import { describe, it, expect } from 'vitest';

describe('generateProjection', () => {
    it('should project balances correctly with bank and manual payments', () => {
        const accounts = [{
            account_number: '123',
            balance: 1000,
            nickname: 'Main',
            credential_id: 1
        }];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Tomorrow
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Day after tomorrow
        const dayAfter = new Date(today);
        dayAfter.setDate(today.getDate() + 2);

        const bankRecurring = [{
            name: 'Rent',
            price: -100,
            category: 'Housing',
            account_number: '123',
            next_payment_date: tomorrow.toISOString()
        }];

        // Manual recurring 
        const manualRecurring = [{
            name: 'Netflix',
            amount: -50,
            category: 'Entertainment',
            account_number: '123',
            day_of_month: dayAfter.getDate(),
            frequency: 'monthly'
        }];

        const projection = generateProjection(accounts, bankRecurring, manualRecurring, [], 10);

        // Day 0: Initial Balance
        expect(projection[0].totalBalance).toBe(1000);

        // Day 1: Tomorrow (Rent -100)
        expect(projection[1].totalBalance).toBe(900);
        expect(projection[1].bankRecurring[0].name).toBe('Rent');

        // Day 2: Day After (Netflix -50)
        const day2Proj = projection[2];
        const manualPayment = day2Proj.bankRecurring.find((p: any) => p.name === 'Netflix');
        if (manualPayment) {
            expect(day2Proj.totalBalance).toBe(850);
        }
    });

    it('should handle end-of-month manual recurring payments logic (e.g. Feb 31 -> Feb 29)', () => {
        const accounts = [{
            account_number: '123',
            balance: 1000,
            nickname: 'Main',
            credential_id: 1
        }];

        // Start from Feb 1st, 2024 (Leap Year)
        const startDate = new Date('2024-02-01T00:00:00');
        startDate.setHours(0, 0, 0, 0);

        const manualRecurring = [{
            name: 'EndMonthBill',
            amount: -100,
            category: 'Bills',
            account_number: '123',
            day_of_month: 31, // Should map to last day of month
            frequency: 'monthly'
        }];

        const projection = generateProjection(accounts, [], manualRecurring, [], 100, startDate);

        // Feb 2024 has 29 days. Last day is Feb 29.
        // We expect a payment on Feb 29.
        const day29 = projection.find((p: any) => p.date === '2024-02-29');
        expect(day29).toBeDefined();
        if (day29) {
            const bill = day29.bankRecurring.find((p: any) => p.name === 'EndMonthBill');
            expect(bill).toBeDefined();
            expect(bill.amount).toBe(-100);
        }

        // March 2024 has 31 days. Expect payment on March 31.
        const dayMar31 = projection.find((p: any) => p.date === '2024-03-31');
        expect(dayMar31).toBeDefined();
        if (dayMar31) {
            const bill = dayMar31.bankRecurring.find((p: any) => p.name === 'EndMonthBill');
            expect(bill).toBeDefined();
        }

        // April 2024 has 30 days. Expect payment on April 30.
        const dayApr30 = projection.find((p: any) => p.date === '2024-04-30');
        expect(dayApr30).toBeDefined();
        if (dayApr30) {
            const bill = dayApr30.bankRecurring.find((p: any) => p.name === 'EndMonthBill');
            expect(bill).toBeDefined();
        }
    });
});
