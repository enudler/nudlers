import { describe, it, expect } from 'vitest';
import { detectRecurringPayments } from '../pages/api/utils/recurringDetection';

interface MockTransaction {
    date: string;
    name: string;
    price: number;
    account_number: string;
    category: string;
    vendor?: string;
}

describe('Recurring Payment Detection', () => {
    const mockTransactions: MockTransaction[] = [
        // Monthly - exact amount
        { date: '2023-01-01', name: 'Netflix', price: -50, account_number: '1234', category: 'Entertainment' },
        { date: '2023-02-01', name: 'Netflix', price: -50, account_number: '1234', category: 'Entertainment' },
        { date: '2023-03-01', name: 'Netflix', price: -50, account_number: '1234', category: 'Entertainment' },

        // Monthly - fuzzy amount (5% tolerance)
        { date: '2023-01-05', name: 'Electric Bill', price: -100, account_number: '1234', category: 'Bills' },
        { date: '2023-02-04', name: 'Electric Bill', price: -105, account_number: '1234', category: 'Bills' },
        { date: '2023-03-06', name: 'Electric Bill', price: -98, account_number: '1234', category: 'Bills' },

        // Bi-monthly - every 2 months
        { date: '2023-01-10', name: 'Water Bill', price: -200, account_number: '1234', category: 'Bills' },
        { date: '2023-03-11', name: 'Water Bill', price: -200, account_number: '1234', category: 'Bills' },
        { date: '2023-05-12', name: 'Water Bill', price: -200, account_number: '1234', category: 'Bills' },

        // Not recurring - random dates
        { date: '2023-01-15', name: 'Amazon', price: -30, account_number: '1234', category: 'Shopping' },
        { date: '2023-01-20', name: 'Amazon', price: -30, account_number: '1234', category: 'Shopping' },
        { date: '2023-03-10', name: 'Amazon', price: -30, account_number: '1234', category: 'Shopping' },

        // Same name but different card - should be separate
        { date: '2023-01-01', name: 'Gym', price: -150, account_number: '1111', category: 'Health' },
        { date: '2023-02-01', name: 'Gym', price: -150, account_number: '1111', category: 'Health' },
        { date: '2023-01-01', name: 'Gym', price: -150, account_number: '2222', category: 'Health' },
        { date: '2023-02-01', name: 'Gym', price: -150, account_number: '2222', category: 'Health' },
    ];

    it('should detect monthly recurring payments with exact amounts', () => {
        const result = detectRecurringPayments(mockTransactions);
        const netflix = result.find((r: any) => r.name.toLowerCase().includes('netflix'));
        expect(netflix).toBeDefined();
        expect(netflix.frequency).toBe('monthly');
        expect(netflix.month_count).toBe(3);
    });

    it('should detect monthly recurring payments with fuzzy amounts', () => {
        const result = detectRecurringPayments(mockTransactions);
        const electric = result.find((r: any) => r.name.toLowerCase().includes('electric'));
        expect(electric).toBeDefined();
        expect(electric.frequency).toBe('monthly');
        expect(electric.monthly_amount).toBeCloseTo(101, 0); // Average of 100, 105, 98 is 101
    });

    it('should detect bi-monthly recurring payments', () => {
        const result = detectRecurringPayments(mockTransactions);
        const water = result.find((r: any) => r.name.toLowerCase().includes('water'));
        expect(water).toBeDefined();
        expect(water.frequency).toBe('bi-monthly');
        expect(water.month_count).toBe(3);
    });

    it('should separate recurring payments by account number', () => {
        const result = detectRecurringPayments(mockTransactions);
        const gyms = result.filter((r: any) => r.name.toLowerCase().includes('gym'));
        expect(gyms).toHaveLength(2);
        expect(gyms.map((g: any) => g.account_number)).toContain('1111');
        expect(gyms.map((g: any) => g.account_number)).toContain('2222');
    });

    it('should not detect random transactions as recurring', () => {
        const result = detectRecurringPayments(mockTransactions);
        const amazon = result.find((r: any) => r.name.toLowerCase().includes('amazon'));
        expect(amazon).toBeUndefined();
    });
});
