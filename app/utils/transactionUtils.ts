import { CREDIT_CARD_VENDORS, BANK_VENDORS } from './constants.js';

export interface BankCheckTransaction {
    card6_digits?: string;
    account_number?: string | number;
    installments_total?: number;
    vendor?: string;
    category?: string;
}

/**
 * Determines if a transaction is a bank transaction (as opposed to a credit card transaction).
 * Logic:
 * 1. Card signals (card6_digits, 4-digit account_number, installments) ALWAYS mean it's a card transaction.
 * 2. If vendor matches known CC vendors, it's a card transaction.
 * 3. Specific categories (Income, Salary, Bank) are bank transactions if no card signals.
 * 4. If vendor matches known Bank vendors, it's a bank transaction.
 */
export const isBankTransaction = (transaction: BankCheckTransaction): boolean => {
    // 1. Check for Credit Card signals FIRST
    const hasCardSignals =
        Boolean(transaction.card6_digits) ||
        (transaction.account_number && String(transaction.account_number).length === 4) ||
        (transaction.installments_total && transaction.installments_total > 0);

    if (hasCardSignals) return false;

    // 2. Check vendor source against known CC vendors
    if (transaction.vendor) {
        const vendorLower = transaction.vendor.toLowerCase();
        if (CREDIT_CARD_VENDORS.some((v: string) => vendorLower.includes(v.toLowerCase()))) {
            return false;
        }
    }

    // 3. Check for specific categories that are definitely bank-side
    if (transaction.category === 'Bank' || transaction.category === 'Income' || transaction.category === 'Salary') {
        return true;
    }

    // 4. Check vendor source against known Bank vendors
    if (transaction.vendor) {
        const vendorLower = transaction.vendor.toLowerCase();
        if (BANK_VENDORS.some((v: string) => vendorLower.includes(v.toLowerCase()))) {
            return true;
        }
    }
    return false;
};
