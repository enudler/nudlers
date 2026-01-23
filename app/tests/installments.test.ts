import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insertTransaction } from '../pages/api/utils/scraperUtils';

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

describe('Installments Support', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [] })
        };
    });

    it('should correctly extract installments from top-level properties', async () => {
        const transaction = {
            date: '2023-01-01',
            description: 'Test Installment',
            originalAmount: 1000,
            chargedAmount: 100,
            installmentsNumber: 1,
            installmentsTotal: 10,
            status: 'completed',
            identifier: 'tx1'
        };

        await insertTransaction(mockClient, transaction, 'max', '1234', 'ILS');

        const insertCall = mockClient.query.mock.calls.find(call =>
            call[0].includes('INSERT INTO transactions')
        );

        expect(insertCall).toBeDefined();
        const params = insertCall[1];
        // installments_number is index 13 ($14)
        // installments_total is index 14 ($15)
        expect(params[13]).toBe(1);
        expect(params[14]).toBe(10);
    });

    it('should correctly extract installments from nested installments object (israeli-bank-scrapers format)', async () => {
        const transaction = {
            date: '2023-01-01',
            description: 'Test Installment',
            originalAmount: 1000,
            chargedAmount: 100,
            installments: {
                number: 2,
                total: 10
            },
            status: 'completed',
            identifier: 'tx2'
        };

        await insertTransaction(mockClient, transaction, 'max', '1234', 'ILS');

        const insertCall = mockClient.query.mock.calls.find(call =>
            call[0].includes('INSERT INTO transactions')
        );

        expect(insertCall).toBeDefined();
        const params = insertCall[1];
        expect(params[13]).toBe(2);
        expect(params[14]).toBe(10);
    });

    it('should handle missing installment data', async () => {
        const transaction = {
            date: '2023-01-01',
            description: 'Regular Transaction',
            originalAmount: 100,
            chargedAmount: 100,
            status: 'completed',
            identifier: 'tx3'
        };

        await insertTransaction(mockClient, transaction, 'max', '1234', 'ILS');

        const insertCall = mockClient.query.mock.calls.find((call: any) =>
            call[0].includes('INSERT INTO transactions')
        );

        expect(insertCall).toBeDefined();
        const params = insertCall[1];
        expect(params[13]).toBeNull();
        expect(params[14]).toBeNull();
    });

    it('should update installments if existing transaction has no installments', async () => {
        // Mock existing transaction with null installments
        mockClient.query.mockResolvedValueOnce({
            rows: [{
                identifier: 'tx4',
                name: 'Test Update',
                price: 100,
                date: new Date('2023-01-01'),
                category: 'Food',
                category_source: 'scraper',
                installments_number: null,
                installments_total: null
            }]
        });

        const transaction = {
            date: '2023-01-01',
            description: 'Test Update',
            originalAmount: 100,
            chargedAmount: 100,
            installments: {
                number: 1,
                total: 5
            },
            status: 'completed',
            identifier: 'tx4'
        };

        const result = await insertTransaction(mockClient, transaction, 'max', '1234', 'ILS');

        expect(result.updated).toBe(true);
        const updateCall = mockClient.query.mock.calls.find((call: any) =>
            call[0].includes('UPDATE transactions SET') && call[0].includes('installments_number')
        );

        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain(1);
        expect(updateCall[1]).toContain(5);
    });

    it('should update installments via business key logic if missing', async () => {
        // First query (identifier) -> empty
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        // Second query (business key) -> match with no installments
        mockClient.query.mockResolvedValueOnce({
            rows: [{
                identifier: 'old-id',
                category: 'Food',
                category_source: 'scraper',
                installments_total: null
            }]
        });

        const transaction = {
            date: '2023-01-01',
            description: 'Business Key Match',
            originalAmount: 200,
            chargedAmount: 200,
            installments: {
                number: 1,
                total: 3
            },
            status: 'completed'
        };

        const result = await insertTransaction(mockClient, transaction, 'max', '1234', 'ILS');

        expect(result.updated).toBe(true);
        const updateCall = mockClient.query.mock.calls.find((call: any) =>
            call[0].includes('UPDATE transactions SET') && call[0].includes('installments_number')
        );

        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain(1);
        expect(updateCall[1]).toContain(3);
    });
});
