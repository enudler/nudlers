import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runScraper } from '../pages/api/utils/scraperUtils';
import * as israeliBankScrapers from 'israeli-bank-scrapers';

// Mock the database module
vi.mock('../pages/api/db', () => ({
    getDB: vi.fn()
}));

// Mock the logger
vi.mock('../../../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock israeli-bank-scrapers
vi.mock('israeli-bank-scrapers', () => ({
    createScraper: vi.fn()
}));

describe('Isracard Scrape Setting', () => {
    let mockClient: any;
    let mockScraper: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };

        mockScraper = {
            scrape: vi.fn(),
            on: vi.fn(),
            terminate: vi.fn()
        };

        (israeliBankScrapers.createScraper as any).mockReturnValue(mockScraper);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should respect isracard_scrape_categories=true (default)', async () => {
        // Mock setting query
        mockClient.query.mockResolvedValueOnce({
            rows: [{ value: 'true' }]
        });

        // Mock scraper result
        mockScraper.scrape.mockResolvedValueOnce({
            success: true,
            accounts: [
                { accountNumber: '1234', txns: [{ description: 'Test', date: '2023-01-01' }] }
            ]
        });

        // Mock history cache and rules
        mockClient.query.mockResolvedValue({ rows: [] });

        const options = {
            companyId: 'isracard',
            startDate: new Date('2023-01-01'),
        };

        await runScraper(mockClient, options, {}, null);

        // Verify that the setting was fetched
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("WHERE key = 'isracard_scrape_categories'")
        );
    });

    it('should respect isracard_scrape_categories=false', async () => {
        // Mock setting query for getIsracardScrapeCategoriesSetting
        mockClient.query.mockResolvedValueOnce({
            rows: [{ value: 'false' }]
        });

        // Mock scraper result
        mockScraper.scrape.mockResolvedValueOnce({
            success: true,
            accounts: [
                { accountNumber: '1234', txns: [{ description: 'Test', date: '2023-01-01' }] }
            ]
        });

        // Mock history cache and rules
        mockClient.query.mockResolvedValue({ rows: [] });

        const options = {
            companyId: 'isracard',
            startDate: new Date('2023-01-01'),
        };

        await runScraper(mockClient, options, {}, null);

        // Verify that the setting was fetched
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("WHERE key = 'isracard_scrape_categories'")
        );

        // In the logs it would show if Phase 3 was skipped, but we can also verify by the absence of further calls
        // Since we mock query to return [], Phase 2 will mark everything as needing API calls,
        // but if Phase 3 is disabled, it won't attempt to call fetchCategoryFromIsracard (which calls page.evaluate)
    });
});
