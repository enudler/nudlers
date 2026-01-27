import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { claimCardOwnership, processScrapedAccounts } from '../pages/api/utils/scraperUtils';
import { getDB } from '../pages/api/db';

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

describe('Account Balance Storage', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            release: vi.fn()
        };
        (getDB as any).mockResolvedValue(mockClient);
    });

    describe('claimCardOwnership', () => {
        it('should store balance when provided', async () => {
            await claimCardOwnership(mockClient, '1234', 'hapoalim', 1, 5000.5);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO card_ownership'),
                expect.arrayContaining(['hapoalim', '1234', 1, 5000.5])
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('balance, balance_updated_at'),
                expect.anything()
            );
        });

        it('should not store balance when null', async () => {
            await claimCardOwnership(mockClient, '1234', 'hapoalim', 1);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO card_ownership'),
                expect.arrayContaining(['hapoalim', '1234', 1])
            );
            expect(mockClient.query).not.toHaveBeenCalledWith(
                expect.stringContaining('balance,'),
                expect.anything()
            );
        });
    });

    describe('processScrapedAccounts', () => {
        it('should pass balance from account to claimCardOwnership', async () => {
            const mockAccounts = [
                {
                    accountNumber: '1234',
                    balance: 7500.25,
                    txns: []
                }
            ];

            // Mock checkCardOwnership returning null (not owned by others)
            mockClient.query.mockResolvedValueOnce({ rows: [] }); // checkCardOwnership
            mockClient.query.mockResolvedValueOnce({ rows: [] }); // claimCardOwnership
            mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
            mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

            await processScrapedAccounts({
                client: mockClient,
                accounts: mockAccounts,
                companyId: 'hapoalim',
                credentialId: 1,
                categorizationRules: [],
                categoryMappings: {},
                billingCycleStartDay: 1,
                updateCategoryOnRescrape: false,
                isBank: true
            });

            // claimCardOwnership is the second query in the main loop
            const claimCall = mockClient.query.mock.calls.find(call =>
                call[0].includes('INSERT INTO card_ownership') && call[1].includes(7500.25)
            );

            expect(claimCall).toBeDefined();
        });
    });
});
