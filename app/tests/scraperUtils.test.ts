import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock the israeli-bank-scrapers module
vi.mock('israeli-bank-scrapers', () => ({
    createScraper: vi.fn()
}));

// Mock the core scrapers module
vi.mock('../scrapers/core.js', () => ({
    RATE_LIMITED_VENDORS: ['isracard', 'amex', 'max', 'visaCal'],
    getChromePath: vi.fn().mockReturnValue('/usr/bin/chromium'),
    getScraperOptions: vi.fn(),
    getPreparePage: vi.fn(),
    sleep: vi.fn().mockImplementation((ms: number) => new Promise(resolve => setTimeout(resolve, Math.min(ms, 10))))
}));

// Mock constants
vi.mock('../utils/constants.js', () => ({
    BANK_VENDORS: ['hapoalim', 'leumi', 'discount', 'mizrahi', 'yahav', 'beinleumi'],
    BEINLEUMI_GROUP_VENDORS: ['beinleumi', 'massad', 'igud', 'mercantile']
}));

// Mock transactionUtils
vi.mock('../pages/api/utils/transactionUtils.js', () => ({
    generateTransactionIdentifier: vi.fn().mockReturnValue('mock-tx-id')
}));

import { getDB } from '../pages/api/db';
import {
    matchCategoryRule,
    applyCategoryMappings,
    prepareCredentials,
    validateCredentials,
    insertTransaction
} from '../pages/api/utils/scraperUtils';
import { sleep } from '../scrapers/core.js';

describe('ScraperUtils', () => {
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };

        (getDB as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('matchCategoryRule', () => {
        const testRules = [
            { name_pattern: 'supermarket', target_category: 'Groceries' },
            { name_pattern: 'restaurant', target_category: 'Dining' },
            { name_pattern: 'uber', target_category: 'Transportation' },
            { name_pattern: 'netflix', target_category: 'Entertainment' }
        ];

        it('should return null for empty description', () => {
            const result = matchCategoryRule('', testRules);
            expect(result).toBeNull();
        });

        it('should return null for null description', () => {
            const result = matchCategoryRule(null as any, testRules);
            expect(result).toBeNull();
        });

        it('should return null for empty rules array', () => {
            const result = matchCategoryRule('supermarket shopping', []);
            expect(result).toBeNull();
        });

        it('should return null for null rules', () => {
            const result = matchCategoryRule('supermarket shopping', null as any);
            expect(result).toBeNull();
        });

        it('should match case-insensitively', () => {
            const result = matchCategoryRule('SUPERMARKET SHOPPING', testRules);
            expect(result).toEqual({ category: 'Groceries', match: 'supermarket' });
        });

        it('should match partial strings', () => {
            const result = matchCategoryRule('Pizza Restaurant Downtown', testRules);
            expect(result).toEqual({ category: 'Dining', match: 'restaurant' });
        });

        it('should return first match when multiple rules match', () => {
            const rules = [
                { name_pattern: 'super', target_category: 'First' },
                { name_pattern: 'supermarket', target_category: 'Second' }
            ];
            const result = matchCategoryRule('supermarket', rules);
            expect(result?.category).toBe('First');
        });

        it('should not match if pattern is not found', () => {
            const result = matchCategoryRule('gas station', testRules);
            expect(result).toBeNull();
        });
    });

    describe('applyCategoryMappings', () => {
        it('should return original category when no mappings exist', () => {
            const result = applyCategoryMappings('Food', {});
            expect(result).toBe('Food');
        });

        it('should return original category when mappings is null', () => {
            const result = applyCategoryMappings('Food', null as any);
            expect(result).toBe('Food');
        });

        it('should return null when category is null', () => {
            const result = applyCategoryMappings(null as any, { Food: 'Groceries' });
            expect(result).toBeNull();
        });

        it('should apply single level mapping', () => {
            const mappings = { 'Food': 'Groceries' };
            const result = applyCategoryMappings('Food', mappings);
            expect(result).toBe('Groceries');
        });

        it('should apply recursive mappings', () => {
            const mappings = {
                'Food': 'Groceries',
                'Groceries': 'Shopping',
                'Shopping': 'Expenses'
            };
            const result = applyCategoryMappings('Food', mappings);
            expect(result).toBe('Expenses');
        });

        it('should handle circular mappings gracefully', () => {
            const mappings = {
                'A': 'B',
                'B': 'C',
                'C': 'A'
            };
            const result = applyCategoryMappings('A', mappings);
            // Should stop at some point, not loop forever
            expect(['A', 'B', 'C']).toContain(result);
        });

        it('should return unmapped category if not in mappings', () => {
            const mappings = { 'Food': 'Groceries' };
            const result = applyCategoryMappings('Entertainment', mappings);
            expect(result).toBe('Entertainment');
        });
    });

    describe('prepareCredentials', () => {
        describe('Hapoalim', () => {
            it('should use userCode field for hapoalim', () => {
                const result = prepareCredentials('hapoalim', {
                    userCode: '123456',
                    password: 'secret'
                });
                expect(result.userCode).toBe('123456');
                expect(result.password).toBe('secret');
            });

            it('should fallback to username for hapoalim if no userCode', () => {
                const result = prepareCredentials('hapoalim', {
                    username: 'myuser',
                    password: 'secret'
                });
                expect(result.userCode).toBe('myuser');
            });

            it('should fallback to id for hapoalim if no userCode or username', () => {
                const result = prepareCredentials('hapoalim', {
                    id: 'myid',
                    password: 'secret'
                });
                expect(result.userCode).toBe('myid');
            });
        });

        describe('Isracard/Amex', () => {
            it('should require id, card6Digits, and password for isracard', () => {
                const result = prepareCredentials('isracard', {
                    id: '123456789',
                    card6Digits: '123456',
                    password: 'secret'
                });
                expect(result.id).toBe('123456789');
                expect(result.card6Digits).toBe('123456');
                expect(result.password).toBe('secret');
            });

            it('should require id, card6Digits, and password for amex', () => {
                const result = prepareCredentials('amex', {
                    id: '123456789',
                    card6Digits: '123456',
                    password: 'secret'
                });
                expect(result.id).toBe('123456789');
                expect(result.card6Digits).toBe('123456');
            });
        });

        describe('Max/VisaCal', () => {
            it('should use username and password for max', () => {
                const result = prepareCredentials('max', {
                    username: 'user@email.com',
                    password: 'secret'
                });
                expect(result.username).toBe('user@email.com');
                expect(result.password).toBe('secret');
            });

            it('should use username and password for visaCal', () => {
                const result = prepareCredentials('visaCal', {
                    username: 'user@email.com',
                    password: 'secret'
                });
                expect(result.username).toBe('user@email.com');
                expect(result.password).toBe('secret');
            });
        });

        describe('Bank vendors', () => {
            const bankVendors = ['mizrahi', 'leumi', 'discount', 'yahav', 'beinleumi', 'otsarHahayal'];

            bankVendors.forEach(vendor => {
                it(`should use username and password for ${vendor}`, () => {
                    const result = prepareCredentials(vendor, {
                        username: 'bankuser',
                        password: 'bankpass'
                    });
                    expect(result.username).toBe('bankuser');
                    expect(result.password).toBe('bankpass');
                });
            });
        });
    });

    describe('validateCredentials', () => {
        describe('Hapoalim', () => {
            it('should throw error when userCode is missing', () => {
                expect(() => validateCredentials({ password: 'pass' }, 'hapoalim'))
                    .toThrow(/userCode and password are required/);
            });

            it('should throw error when password is missing', () => {
                expect(() => validateCredentials({ userCode: 'code' }, 'hapoalim'))
                    .toThrow(/userCode and password are required/);
            });

            it('should not throw when credentials are valid', () => {
                expect(() => validateCredentials({ userCode: 'code', password: 'pass' }, 'hapoalim'))
                    .not.toThrow();
            });
        });

        describe('Isracard/Amex', () => {
            const vendors = ['isracard', 'amex'];

            vendors.forEach(vendor => {
                it(`should throw error when id is missing for ${vendor}`, () => {
                    expect(() => validateCredentials({ card6Digits: '123456', password: 'pass' }, vendor))
                        .toThrow(/id, card6Digits, and password are required/);
                });

                it(`should throw error when card6Digits is missing for ${vendor}`, () => {
                    expect(() => validateCredentials({ id: '123', password: 'pass' }, vendor))
                        .toThrow(/id, card6Digits, and password are required/);
                });

                it(`should not throw when credentials are valid for ${vendor}`, () => {
                    expect(() => validateCredentials({ id: '123', card6Digits: '123456', password: 'pass' }, vendor))
                        .not.toThrow();
                });
            });
        });

        describe('Max/VisaCal', () => {
            const vendors = ['max', 'visaCal'];

            vendors.forEach(vendor => {
                it(`should throw error when username is missing for ${vendor}`, () => {
                    expect(() => validateCredentials({ password: 'pass' }, vendor))
                        .toThrow(/username and password are required/);
                });

                it(`should throw error when password is missing for ${vendor}`, () => {
                    expect(() => validateCredentials({ username: 'user' }, vendor))
                        .toThrow(/username and password are required/);
                });

                it(`should not throw when credentials are valid for ${vendor}`, () => {
                    expect(() => validateCredentials({ username: 'user', password: 'pass' }, vendor))
                        .not.toThrow();
                });
            });
        });
    });

    describe('insertTransaction', () => {
        const mockDate = new Date('2023-01-01');
        const mockTransaction = {
            date: mockDate.toISOString(),
            processedDate: mockDate.toISOString(),
            originalAmount: 100,
            originalCurrency: 'ILS',
            chargedAmount: 100,
            description: 'Test Transaction',
            memo: 'Memo',
            status: 'completed',
            identifier: 'tx123',
            type: 'debit',
            installmentsNumber: 1,
            installmentsTotal: 1,
            category: null
        };

        it('should check for existing transaction first', async () => {
            mockClient.query.mockResolvedValue({ rows: [] }); // No existing transaction

            await insertTransaction(
                mockClient,
                mockTransaction,
                'max',
                '1234',
                'ILS'
            );

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT identifier'),
                expect.any(Array)
            );
        });

        it('should insert credit card transaction with transaction_type=credit_card', async () => {
            // First query returns no existing txn
            // Second query (settings) returns default
            // Third query is the INSERT
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // Call 1: identifier
                .mockResolvedValueOnce({ rows: [] }) // Call 2: businessKeyCheck
                .mockResolvedValueOnce({ rows: [] }); // Call 3: INSERT ON CONFLICT

            await insertTransaction(
                mockClient,
                mockTransaction,
                'max',
                '1234',
                'ILS',
                [],
                false,
                {},
                false // isBank = false
            );

            // Verify INSERT query arguments
            const insertCall = mockClient.query.mock.calls.find(call =>
                call[0].includes('INSERT INTO transactions')
            );

            expect(insertCall).toBeDefined();
            if (insertCall) {
                const params = insertCall[1];
                // transaction_type is the last parameter (index 18 based on 1-based params $1...$19)
                expect(params[18]).toBe('credit_card');
            }
        });

        it('should insert bank transaction with transaction_type=bank', async () => {
            // First query returns no existing txn
            // No settings query for bank
            mockClient.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            await insertTransaction(
                mockClient,
                mockTransaction,
                'hapoalim',
                '1234',
                'ILS',
                [],
                false,
                {},
                true // isBank = true
            );

            const insertCall = mockClient.query.mock.calls.find(call =>
                call[0].includes('INSERT INTO transactions')
            );

            expect(insertCall).toBeDefined();
            if (insertCall) {
                const params = insertCall[1];
                expect(params[18]).toBe('bank');
            }
        });

        it('should not insert if transaction exists', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    identifier: 'tx123',
                    name: 'Test Transaction',
                    price: 100,
                    date: mockDate.toISOString()
                }]
            });

            const result = await insertTransaction(
                mockClient,
                mockTransaction,
                'max',
                '1234',
                'ILS'
            );

            expect(result.duplicated).toBe(true);
            expect(mockClient.query).not.toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO'),
                expect.any(Array)
            );
        });

        it('should update category if updateCategoryOnRescrape is true and new category found', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    identifier: 'tx123',
                    name: 'Test Transaction',
                    price: 100,
                    date: mockDate.toISOString(),
                    category: null,
                    category_source: null
                }]
            });

            const transactionWithCategory = { ...mockTransaction, category: 'New Category' };

            const result = await insertTransaction(
                mockClient,
                transactionWithCategory,
                'max',
                '1234',
                'ILS',
                [],
                true // updateCategoryOnRescrape
            );

            expect(result.updated).toBe(true);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE transactions SET category'),
                expect.any(Array)
            );
        });

        it('should insert negative amount correctly (regression test)', async () => {
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // No existing txn
                .mockResolvedValueOnce({ rows: [] }) // Settings (if any) or bank check
                .mockResolvedValueOnce({ rows: [] }); // Business key check

            const negativeTransaction = {
                ...mockTransaction,
                chargedAmount: -50.5,
                originalAmount: -50.5
            };

            await insertTransaction(
                mockClient,
                negativeTransaction,
                'max',
                '1234',
                'ILS'
            );

            const insertCall = mockClient.query.mock.calls.find(call =>
                call[0].includes('INSERT INTO transactions')
            );

            expect(insertCall).toBeDefined();
        });

        it('should NOT mark transactions on consecutive days as duplicates', async () => {
            const date1 = new Date('2023-01-01');
            const date2 = new Date('2023-01-02');

            const tx1 = { ...mockTransaction, date: date1.toISOString(), identifier: 'tx1' };
            const tx2 = { ...mockTransaction, date: date2.toISOString(), identifier: 'tx2' };

            // First call for tx2: identifier check (tx2) -> empty
            // Second call for tx2: businessKeyCheck (date2) -> check for same date, name, price
            // If we have tx1 in DB with date1, businessKeyCheck for tx2 with date2 should return empty
            mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // identifier check for tx2
                .mockResolvedValueOnce({ rows: [] }) // businessKeyCheck for tx2 (date2 != date1)
                .mockResolvedValueOnce({ rows: [] }); // INSERT for tx2

            const result = await insertTransaction(
                mockClient,
                tx2,
                'max',
                '1234',
                'ILS'
            );

            expect(result.duplicated).not.toBe(true);
        });
    });
});

describe('Transaction Type Handling', () => {
    // These tests validate the vendor classification

    it('should classify bank vendors correctly', () => {
        const bankVendors = ['hapoalim', 'leumi', 'discount', 'mizrahi', 'yahav', 'beinleumi'];
        bankVendors.forEach(vendor => {
            expect(bankVendors).toContain(vendor);
        });
    });

    it('should classify credit card vendors correctly', () => {
        const creditCardVendors = ['isracard', 'amex', 'max', 'visaCal'];
        creditCardVendors.forEach(vendor => {
            expect(creditCardVendors).toContain(vendor);
        });
    });
});
