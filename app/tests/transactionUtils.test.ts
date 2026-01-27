import { describe, it, expect } from 'vitest';
import { isBankTransaction } from '../utils/transactionUtils';

describe('isBankTransaction', () => {
    it('should identify a bank transaction by vendor', () => {
        expect(isBankTransaction({ vendor: 'hapoalim' })).toBe(true);
        expect(isBankTransaction({ vendor: 'leumi' })).toBe(true);
        expect(isBankTransaction({ vendor: 'mizrahi' })).toBe(true);
    });

    it('should identify a credit card transaction by vendor', () => {
        expect(isBankTransaction({ vendor: 'visaCal' })).toBe(false);
        expect(isBankTransaction({ vendor: 'max' })).toBe(false);
        expect(isBankTransaction({ vendor: 'isracard' })).toBe(false);
    });

    it('should prioritize card signals over bank categories', () => {
        // A transaction from a bank vendor but with card signals (e.g. scraped card from bank site) 
        // should be treated as a card transaction
        expect(isBankTransaction({
            category: 'Bank',
            card6_digits: '123456',
            vendor: 'hapoalim'
        })).toBe(false);

        expect(isBankTransaction({
            vendor: 'hapoalim',
            account_number: '1234' // 4 digits = card
        })).toBe(false);
    });

    it('should identify bank transactions by category if no card signals', () => {
        expect(isBankTransaction({ category: 'Salary' })).toBe(true);
        expect(isBankTransaction({ category: 'Income' })).toBe(true);
        expect(isBankTransaction({ category: 'Bank' })).toBe(true);
    });

    it('should handle installment transactions as card transactions', () => {
        expect(isBankTransaction({
            vendor: 'hapoalim',
            installments_total: 12
        })).toBe(false);
    });

    it('should return false for unknown vendors with no signals', () => {
        expect(isBankTransaction({ vendor: 'unknown' })).toBe(false);
    });
});
