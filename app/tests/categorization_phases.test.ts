import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import {
    matchCategoryRule,
    lookupCachedCategory,
    loadCategoryCache,
    insertTransaction,
    resetCategoryCache
} from '../pages/api/utils/scraperUtils';

describe('3-Phase Categorization Logic', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        resetCategoryCache();
        mockClient = {
            query: vi.fn()
        };
    });

    describe('Phase 1: Cache (Exact Match)', () => {
        it('should prioritize cached categories over others', async () => {
            // Warm up cache - mock both queries
            // 1. Transaction history query (Implicit) - return empty if we want to test explicit
            mockClient.query.mockResolvedValueOnce({ rows: [] });
            // 2. Explicit overrides query
            mockClient.query.mockResolvedValueOnce({
                rows: [{ description: 'AMAZON', category: 'Shopping' }]
            });
            await loadCategoryCache(mockClient);

            const result = lookupCachedCategory('AMAZON');
            expect(result).toBe('Shopping');
        });

        it('should handle case insensitivity in cache', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [] });
            mockClient.query.mockResolvedValueOnce({
                rows: [{ description: 'AMAZON', category: 'Shopping' }]
            });
            await loadCategoryCache(mockClient);

            const result = lookupCachedCategory('amazon');
            expect(result).toBe('Shopping');
        });
    });

    describe('Phase 2: Rules (Pattern Match)', () => {
        const rules = [
            { name_pattern: 'WOLT', target_category: 'Dining Out' },
            { name_pattern: 'PAZ', target_category: 'Transportation' }
        ];

        it('should match regex patterns for categories', () => {
            const match = matchCategoryRule('WOLT ISRAEL', rules);
            expect(match?.category).toBe('Dining Out');
        });

        it('should return null if no rule matches', () => {
            const match = matchCategoryRule('UNKNOWN MERCHANT', rules);
            expect(match).toBeNull();
        });
    });

    describe('Phase 3: Hybrid Priorities in insertTransaction', () => {
        it('should prioritize Cache over Rule over Scraper', async () => {
            // Rules
            const rules = [{ name_pattern: 'SUPER', target_category: 'Rule-Category' }];

            // Cache (Simulate through lookupCachedCategory helper which is already warmed up in Phase 1 test)
            // But for a clean test, let's assume 'SUPER' is NOT in cache yet.

            const transaction = {
                description: 'SUPER PHARM',
                category: 'Scraper-Category', // Phase 3 (Source)
                date: new Date().toISOString(),
                chargedAmount: 100
            };

            mockClient.query.mockResolvedValue({ rows: [] }); // No duplicates

            const result = await insertTransaction(
                mockClient,
                transaction as any,
                'isracard',
                '1234',
                'ILS',
                rules,
                false
            );

            // Should be Rule-Category because Rule > Scraper
            expect(result.category).toBe('Rule-Category');
            expect(result.categorySource).toBe('rule');
        });

        it('should allow Scraper category if no Cache or Rules match', async () => {
            const transaction = {
                description: 'NEW SHOP',
                category: 'Scraper-Category',
                date: new Date().toISOString(),
                chargedAmount: 100
            };

            mockClient.query.mockResolvedValue({ rows: [] });

            const result = await insertTransaction(
                mockClient,
                transaction as any,
                'isracard',
                '1234',
                'ILS',
                [],
                false
            );

            expect(result.category).toBe('Scraper-Category');
            expect(result.categorySource).toBe('scraper');
        });

    });

    describe('Double-Spend / Duplicate Protection (with History Cache)', () => {
        it('should skip DB query if transaction is in historyCache', async () => {
            const historyCache = {
                idMap: new Map([['tx123', { name: 'TEST', price: 100, date: '2023-01-01', category: 'Misc', category_source: 'scraper' }]]),
                businessKeys: new Map([['2023-01-01|test|100.00', { category: 'Misc', category_source: 'scraper' }]])
            };

            const transaction = {
                identifier: 'tx123',
                description: 'TEST',
                date: '2023-01-01',
                chargedAmount: 100
            };

            const result = await insertTransaction(
                mockClient,
                transaction as any,
                'isracard',
                '1234',
                'ILS',
                [],
                false,
                {},
                false,
                10,
                historyCache as any
            );

            expect(result.duplicated).toBe(true);
            // Verify no SELECT query was made for identifier
            expect(mockClient.query).not.toHaveBeenCalledWith(
                expect.stringContaining('SELECT identifier'),
                expect.any(Array)
            );
        });
    });
});
