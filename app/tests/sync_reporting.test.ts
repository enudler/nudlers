import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDB } from '../pages/api/db';
import * as scraperUtils from '../pages/api/utils/scraperUtils';
import scrapeEventsHandler from '../pages/api/scrape-events/index';
import getScrapeReportHandler from '../pages/api/scrape-events/[id]/report';
import scrapeHandler from '../pages/api/scrapers/run';

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

// Mock scraperUtils functions selectively
vi.mock('../pages/api/utils/scraperUtils', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        runScraper: vi.fn().mockResolvedValue({ success: true, accounts: [] }),
        processScrapedAccounts: vi.fn(),
        updateScrapeAudit: vi.spyOn(actual, 'updateScrapeAudit'), // Spy on the actual implementation
        insertScrapeAudit: vi.fn().mockResolvedValue(123),
        updateCredentialLastSynced: vi.fn(),
        getFetchCategoriesSetting: vi.fn().mockResolvedValue(true),
        getScraperTimeout: vi.fn().mockResolvedValue(60000),
        getScrapeRetries: vi.fn().mockResolvedValue(3),
        getScraperOptions: vi.fn().mockReturnValue({}),
        getLogHttpRequestsSetting: vi.fn().mockResolvedValue(false),
        loadCategorizationRules: vi.fn().mockResolvedValue([]),
        loadCategoryMappings: vi.fn().mockResolvedValue({}),
        getUpdateCategoryOnRescrapeSetting: vi.fn().mockResolvedValue(false),
        getBillingCycleStartDay: vi.fn().mockResolvedValue(10),
        prepareCredentials: vi.fn().mockReturnValue({}),
        validateCredentials: vi.fn(),
        checkScraperConcurrency: vi.fn().mockResolvedValue(undefined)
    };
});

// Mock constants
vi.mock('../utils/constants', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        BANK_VENDORS: ['hapoalim']
    };
});

describe('Sync Reporting and Audit', () => {
    let mockClient: any;
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };

        (getDB as any).mockResolvedValue(mockClient);

        // Reset mocks to default values
        (scraperUtils.runScraper as any).mockResolvedValue({ success: true, accounts: [] });
        (scraperUtils.processScrapedAccounts as any).mockResolvedValue({ savedTransactions: 0, processedTransactions: [] });

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
            flushHeaders: vi.fn(),
            on: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('updateScrapeAudit Logic', () => {
        it('should save report_json when provided', async () => {
            const auditId = 123;
            const status = 'success';
            const message = 'Test message';
            const report = { processedTransactions: [{ description: 'Test' }], savedTransactions: 1 };

            // We call the actual implementation which we've spied on
            await scraperUtils.updateScrapeAudit(mockClient, auditId, status, message, report);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringMatching(/UPDATE scrape_events\s+SET status = \$1,\s+message = \$2,\s+report_json = \$3,\s+duration_seconds = COALESCE\(\$6, EXTRACT\(EPOCH FROM \(CURRENT_TIMESTAMP - created_at\)\)\),\s+retry_count = COALESCE\(\$5, retry_count\)\s+WHERE id = \$4/),
                [status, message, report, auditId, null, null]
            );
        });

        it('should not include report_json in query when not provided', async () => {
            const auditId = 123;
            const status = 'failed';
            const message = 'Error occurred';

            await scraperUtils.updateScrapeAudit(mockClient, auditId, status, message);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringMatching(/UPDATE scrape_events\s+SET status = \$1,\s+message = \$2,\s+duration_seconds = COALESCE\(\$5, EXTRACT\(EPOCH FROM \(CURRENT_TIMESTAMP - created_at\)\)\),\s+retry_count = COALESCE\(\$4, retry_count\)\s+WHERE id = \$3/),
                [status, message, auditId, null, null]
            );
        });
    });

    describe('API: /api/scrape_events', () => {
        it('should include report_json in the SELECT query', async () => {
            mockReq = {
                method: 'GET',
                query: { limit: '10' }
            };

            mockClient.query.mockResolvedValue({
                rows: [
                    { id: 1, vendor: 'max', report_json: { savedTransactions: 5 } }
                ]
            });

            await scrapeEventsHandler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                expect.any(Array)
            );

            const [sql] = mockClient.query.mock.calls[0];
            expect(sql).toContain('report_json');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ report_json: expect.any(Object) })
            ]));
        });
    });

    describe('API: /api/get_scrape_report', () => {
        it('should return report_json for a specific ID', async () => {
            const mockReport = { processedTransactions: [{ name: 'Tx 1' }] };
            const duration = 45;
            mockReq = {
                method: 'GET',
                query: { id: '123' }
            };

            mockClient.query.mockResolvedValue({
                rows: [{ report_json: mockReport, duration_seconds: duration }]
            });

            await getScrapeReportHandler(mockReq, mockRes);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT report_json, duration_seconds FROM scrape_events WHERE id = $1'),
                ['123']
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                ...mockReport,
                duration_seconds: duration
            });
        });

        it('should return 404 if event not found', async () => {
            mockReq = {
                method: 'GET',
                query: { id: '999' }
            };

            mockClient.query.mockResolvedValue({
                rows: []
            });

            await getScrapeReportHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });
    });

    describe('API: /api/scrape', () => {
        it('should call updateScrapeAudit with stats on success', async () => {
            const mockStats = { savedTransactions: 10, processedTransactions: [] };

            mockReq = {
                method: 'POST',
                body: {
                    options: { companyId: 'hapoalim', startDate: '2023-01-01' },
                    credentials: { username: 'user', password: 'pass' },
                    credentialId: 1
                }
            };

            // Set retries to 0 to avoid retry loop complexity in test
            (scraperUtils.getScrapeRetries as any).mockResolvedValue(0);
            (scraperUtils.runScraper as any).mockResolvedValue({ success: true, accounts: [] });
            (scraperUtils.processScrapedAccounts as any).mockResolvedValue(mockStats);
            (scraperUtils.insertScrapeAudit as any).mockResolvedValue(123);

            await scrapeHandler(mockReq, mockRes);

            // We check the spy on updateScrapeAudit
            expect(scraperUtils.updateScrapeAudit).toHaveBeenCalledWith(
                expect.anything(),
                123,
                'success',
                expect.stringContaining('saved=10'),
                mockStats,
                0,
                expect.any(Number)
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });
    });
});
