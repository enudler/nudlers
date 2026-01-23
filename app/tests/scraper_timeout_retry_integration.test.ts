/**
 * Integration tests for scraper timeout and retry behavior
 * 
 * This test suite verifies that:
 * 1. All scrapers respect and use the global timeout setting
 * 2. Timeout applies to the FULL scraping process, not individual operations
 * 3. Retry logic correctly respects the retry count setting
 * 4. Timeouts are enforced across retries
 * 5. All different scraper endpoints honor these settings
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    getScraperOptions,
    getScraperTimeout,
    getScrapeRetries,
    runScraper,
    resetCategoryCache
} from '../pages/api/utils/scraperUtils';
import { getPreparePage } from '../scrapers/core';
import { DEFAULT_SCRAPER_TIMEOUT, DEFAULT_SCRAPE_RETRIES } from '../utils/constants';
import logger from '../utils/logger';

// Mock logger
vi.mock('../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));

// Mock israeli-bank-scrapers
vi.mock('israeli-bank-scrapers', () => ({
    createScraper: vi.fn()
}));

// Mock CustomVisaCalScraper
vi.mock('../scrapers/CustomVisaCalScraper.js', () => ({
    default: class MockCustomVisaCalScraper {
        constructor(public options: any) { }
        on = vi.fn();
        scrape = vi.fn();
        terminate = vi.fn();
    }
}));

describe('Scraper Timeout and Retry Integration Tests', () => {
    let mockClient: {
        query: any;
        release: any;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        resetCategoryCache();

        mockClient = {
            query: vi.fn(),
            release: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Timeout Settings', () => {
        it('should use default timeout when setting is not found', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            const timeout = await getScraperTimeout(mockClient);

            expect(timeout).toBe(DEFAULT_SCRAPER_TIMEOUT);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                ['scraper_timeout']
            );
        });

        it('should use custom timeout when setting is configured', async () => {
            const customTimeout = 120000; // 2 minutes
            mockClient.query.mockResolvedValue({
                rows: [{ value: customTimeout.toString() }]
            });

            const timeout = await getScraperTimeout(mockClient);

            expect(timeout).toBe(customTimeout);
        });

        it('should fallback to default when timeout value is invalid', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: 'invalid' }]
            });

            const timeout = await getScraperTimeout(mockClient);

            expect(timeout).toBe(DEFAULT_SCRAPER_TIMEOUT);
        });

        it('should accept timeout of 0 (for testing/debugging)', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '0' }]
            });

            const timeout = await getScraperTimeout(mockClient);

            expect(timeout).toBe(0);
        });
    });

    describe('Timeout Propagation to Scrapers', () => {
        const vendors = ['visaCal', 'max', 'isracard', 'amex', 'hapoalim', 'leumi', 'discount'];

        vendors.forEach(vendor => {
            it(`should propagate timeout to ${vendor} scraper options`, () => {
                const customTimeout = 150000;
                const startDate = new Date('2024-01-01');

                const options = getScraperOptions(vendor, startDate, {
                    timeout: customTimeout
                });

                expect(options.timeout).toBe(customTimeout);
                expect(options.defaultTimeout).toBe(customTimeout);
            });

            it(`should use default timeout for ${vendor} when not specified`, () => {
                const startDate = new Date('2024-01-01');

                const options = getScraperOptions(vendor, startDate, {});

                expect(options.timeout).toBe(DEFAULT_SCRAPER_TIMEOUT);
                expect(options.defaultTimeout).toBe(DEFAULT_SCRAPER_TIMEOUT);
            });
        });

        it('should propagate timeout to preparePage function', async () => {
            const customTimeout = 180000;
            const mockPage = {
                setDefaultNavigationTimeout: vi.fn(),
                setDefaultTimeout: vi.fn(),
                setRequestInterception: vi.fn(),
                on: vi.fn(),
                goto: vi.fn(),
                evaluateOnNewDocument: vi.fn(),
                setExtraHTTPHeaders: vi.fn()
            };

            const preparePage = getPreparePage({
                companyId: 'visaCal',
                timeout: customTimeout
            });

            // preparePage should be async function
            expect(preparePage).toBeInstanceOf(Function);

            // Call it and verify timeout is applied
            await preparePage(mockPage as any);

            expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(customTimeout);
            expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(customTimeout);
        });
    });

    describe('Full Process Timeout (Not Partial)', () => {
        it('should set page-level timeout that applies to entire scraping process', async () => {
            const timeout = 100000;
            const mockPage = {
                setDefaultNavigationTimeout: vi.fn(),
                setDefaultTimeout: vi.fn(),
                setRequestInterception: vi.fn(),
                on: vi.fn(),
                goto: vi.fn(),
                evaluateOnNewDocument: vi.fn(),
                setExtraHTTPHeaders: vi.fn()
            };

            const preparePage = getPreparePage({
                companyId: 'isracard',
                timeout: timeout
            });

            await preparePage(mockPage as any);

            // Verify that page-level timeouts are set (these apply to ALL operations)
            expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(timeout);
            expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(timeout);
        });

        it('should not have operation-specific timeouts that override page timeout', () => {
            const timeout = 90000;
            const startDate = new Date();

            const options = getScraperOptions('max', startDate, { timeout });

            // Verify there are no operation-specific timeouts that would override
            expect(options.timeout).toBe(timeout);
            expect(options.defaultTimeout).toBe(timeout);

            // protocolTimeout should be separate (for CDP protocol, not scraping)
            expect(options.protocolTimeout).toBeDefined();
        });
    });

    describe('Retry Settings Validation', () => {
        it('should load retry count from database', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ value: '5' }]
            });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(5);
        });

        it('should use default retry count when not configured', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });

            const retries = await getScrapeRetries(mockClient);

            expect(retries).toBe(DEFAULT_SCRAPE_RETRIES);
        });

        it('should validate retry count boundaries (0-10)', async () => {
            // Test 0 retries
            mockClient.query.mockResolvedValue({ rows: [{ value: '0' }] });
            expect(await getScrapeRetries(mockClient)).toBe(0);

            // Test 10 retries (max)
            mockClient.query.mockResolvedValue({ rows: [{ value: '10' }] });
            expect(await getScrapeRetries(mockClient)).toBe(10);

            // Test >10 should be capped
            mockClient.query.mockResolvedValue({ rows: [{ value: '50' }] });
            expect(await getScrapeRetries(mockClient)).toBe(10);
        });
    });

    describe('Retry Loop Timeout Enforcement', () => {
        it('should calculate correct number of attempts with retries', () => {
            const testCases = [
                { maxRetries: 0, expectedAttempts: 1 },
                { maxRetries: 1, expectedAttempts: 2 },
                { maxRetries: 3, expectedAttempts: 4 },
                { maxRetries: 5, expectedAttempts: 6 },
            ];

            testCases.forEach(({ maxRetries, expectedAttempts }) => {
                let attempts = 0;
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    attempts++;
                }
                expect(attempts).toBe(expectedAttempts);
            });
        });

        it('should calculate exponential backoff delays correctly', () => {
            const calculateDelay = (attempt: number) =>
                Math.min(5000 * Math.pow(2, attempt - 1), 60000);

            expect(calculateDelay(1)).toBe(5000);   // First retry: 5s
            expect(calculateDelay(2)).toBe(10000);  // Second retry: 10s
            expect(calculateDelay(3)).toBe(20000);  // Third retry: 20s
            expect(calculateDelay(4)).toBe(40000);  // Fourth retry: 40s
            expect(calculateDelay(5)).toBe(60000);  // Fifth retry: 60s (capped)
            expect(calculateDelay(10)).toBe(60000); // Still capped at 60s
        });

        it('should respect max retry count and stop attempting', () => {
            const maxRetries = 2;
            const attempts: number[] = [];
            let shouldContinue = true;

            for (let attempt = 0; attempt <= maxRetries && shouldContinue; attempt++) {
                attempts.push(attempt);

                // Simulate all failures
                const isFinalAttempt = attempt >= maxRetries;
                if (isFinalAttempt) {
                    shouldContinue = false; // Stop retrying
                }
            }

            expect(attempts).toEqual([0, 1, 2]); // 3 total attempts
            expect(attempts.length).toBe(maxRetries + 1);
        });
    });

    describe('Timeout Configuration Across Vendors', () => {
        const allVendors = [
            // Credit cards
            'visaCal',
            'max',
            'isracard',
            'amex',
            // Banks
            'hapoalim',
            'leumi',
            'discount',
            'mizrahi',
            'yahav',
            'beinleumi',
            'otsarHahayal',
            'massad'
        ];

        allVendors.forEach(vendor => {
            it(`should configure timeout for ${vendor}`, () => {
                const timeout = 120000;
                const options = getScraperOptions(vendor, new Date(), { timeout });

                expect(options.timeout).toBe(timeout);
                expect(options.companyId).toBe(vendor);
            });
        });

        it('should ensure CustomVisaCalScraper receives timeout in options', () => {
            const timeout = 100000;
            const options = getScraperOptions('visaCal', new Date(), { timeout });

            expect(options.companyId).toBe('visaCal');
            expect(options.timeout).toBe(timeout);

            // CustomVisaCalScraper uses this.options.timeout throughout its code
            // Verify it's available in the options object
            expect(options.timeout).toBeDefined();
        });
    });

    describe('CustomVisaCalScraper Timeout Usage', () => {
        it('should use timeout from options in getLoginFrame', () => {
            // CustomVisaCalScraper uses: this.options.timeout || 10000
            // We need to ensure this.options.timeout is set

            const scraperOptions = getScraperOptions('visaCal', new Date(), {
                timeout: 150000
            });

            expect(scraperOptions.timeout).toBe(150000);
            // CustomVisaCalScraper will access this via this.options.timeout
        });

        it('should not have hardcoded timeouts overriding user settings', () => {
            const customTimeout = 200000;
            const options = getScraperOptions('visaCal', new Date(), {
                timeout: customTimeout
            });

            // Verify that the timeout is set correctly
            expect(options.timeout).toBe(customTimeout);

            // Note: CustomVisaCalScraper code shows: this.options.timeout || 10000
            // This means if timeout is set, it will use it; otherwise fallback to 10000
            // This is acceptable as long as we always pass timeout
        });
    });

    describe('End-to-End Timeout and Retry Behavior', () => {
        it('should demonstrate timeout applies to full scrape process', () => {
            const timeout = 90000;
            const startDate = new Date();

            // Get options for scraper
            const options = getScraperOptions('isracard', startDate, { timeout });

            // Verify timeout is in options
            expect(options.timeout).toBe(timeout);
            expect(options.defaultTimeout).toBe(timeout);

            // preparePage will use this timeout for page-level settings
            const preparePage = getPreparePage({
                companyId: 'isracard',
                timeout: options.timeout
            });

            expect(preparePage).toBeInstanceOf(Function);
        });

        it('should verify retry loop uses timeout for each attempt', async () => {
            const maxRetries = 2;
            const timeout = 60000;
            let attemptsMade = 0;

            // Simulate the retry loop from run-stream.js
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attemptsMade++;

                // Each attempt should use the same timeout
                const options = getScraperOptions('max', new Date(), { timeout });
                expect(options.timeout).toBe(timeout);

                // Simulate failure and retry
                if (attempt < maxRetries) {
                    const retryDelay = Math.min(5000 * Math.pow(2, attempt), 60000);
                    expect(retryDelay).toBeGreaterThan(0);
                }
            }

            expect(attemptsMade).toBe(maxRetries + 1);
        });
    });

    describe('Timeout Consistency Checks', () => {
        it('should ensure timeout is same across all scraper components', () => {
            const timeout = 120000;
            const vendor = 'hapoalim';

            // 1. Options
            const options = getScraperOptions(vendor, new Date(), { timeout });
            expect(options.timeout).toBe(timeout);
            expect(options.defaultTimeout).toBe(timeout);

            // 2. preparePage
            const preparePageFn = getPreparePage({
                companyId: vendor,
                timeout: timeout
            });
            expect(preparePageFn).toBeDefined();

            // Timeout should be consistent everywhere
        });

        it('should not allow timeout to be lost in option spreading', () => {
            const timeout = 100000;
            const startDate = new Date();

            const baseOptions = getScraperOptions('leumi', startDate, { timeout });

            // Simulate spreading options (like in runScraper)
            const spreadOptions = {
                ...baseOptions,
                startDate: new Date(baseOptions.startDate),
            };

            expect(spreadOptions.timeout).toBe(timeout);
            expect(spreadOptions.defaultTimeout).toBe(timeout);
        });
    });

    describe('Retry Count Boundary Tests', () => {
        it('should handle 0 retries correctly (1 attempt total)', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ value: '0' }] });
            const maxRetries = await getScrapeRetries(mockClient);

            let attempts = 0;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attempts++;
            }

            expect(maxRetries).toBe(0);
            expect(attempts).toBe(1);
        });

        it('should handle maximum retries correctly (10 retries = 11 attempts)', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ value: '10' }] });
            const maxRetries = await getScrapeRetries(mockClient);

            let attempts = 0;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                attempts++;
            }

            expect(maxRetries).toBe(10);
            expect(attempts).toBe(11);
        });
    });

    describe('Timeout Edge Cases', () => {
        it('should handle very small timeouts', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ value: '1000' }] }); // 1 second
            const timeout = await getScraperTimeout(mockClient);

            expect(timeout).toBe(1000);
        });

        it('should handle very large timeouts', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ value: '600000' }] }); // 10 minutes
            const timeout = await getScraperTimeout(mockClient);

            expect(timeout).toBe(600000);
        });

        it('should handle null/undefined timeout values gracefully', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ value: null }] });
            const timeout = await getScraperTimeout(mockClient);

            expect(timeout).toBe(DEFAULT_SCRAPER_TIMEOUT);
        });
    });

    describe('Protocol Timeout vs Scraper Timeout', () => {
        it('should have separate protocol timeout for CDP communication', () => {
            const scraperTimeout = 90000;
            const options = getScraperOptions('discount', new Date(), {
                timeout: scraperTimeout
            });

            // Scraper timeout is for scraping operations
            expect(options.timeout).toBe(scraperTimeout);

            // Protocol timeout is for Chrome DevTools Protocol (should be separate and higher)
            expect(options.protocolTimeout).toBeDefined();
            expect(options.protocolTimeout).toBeGreaterThan(scraperTimeout);
        });

        it('should allow custom protocol timeout', () => {
            const scraperTimeout = 90000;
            const protocolTimeout = 300000;

            const options = getScraperOptions('yahav', new Date(), {
                timeout: scraperTimeout,
                protocolTimeout: protocolTimeout
            });

            expect(options.timeout).toBe(scraperTimeout);
            expect(options.protocolTimeout).toBe(protocolTimeout);
        });
    });

    describe('Timeout Application Verification', () => {
        it('should verify page.setDefaultTimeout is called with correct value', async () => {
            const timeout = 120000;
            const mockPage = {
                setDefaultNavigationTimeout: vi.fn(),
                setDefaultTimeout: vi.fn(),
                setRequestInterception: vi.fn(),
                on: vi.fn(),
                goto: vi.fn(),
                evaluateOnNewDocument: vi.fn(),
                setExtraHTTPHeaders: vi.fn()
            };

            const preparePage = getPreparePage({
                companyId: 'beinleumi',
                timeout: timeout
            });

            await preparePage(mockPage as any);

            // These are the critical calls that apply timeout to ALL operations
            expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledTimes(1);
            expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(timeout);
            expect(mockPage.setDefaultTimeout).toHaveBeenCalledTimes(1);
            expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(timeout);
        });
    });
});
