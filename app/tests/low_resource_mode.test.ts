import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('LOW_RESOURCES_MODE', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    describe('Scraper Core Logic', () => {
        it('should include low resource flags when LOW_RESOURCES_MODE is true', async () => {
            vi.stubEnv('LOW_RESOURCES_MODE', 'true');
            const { getScraperOptions } = await import('../scrapers/core.js');
            const { SCRAPER_LOW_RESOURCE_FLAGS } = await import('../utils/constants.js');

            const options = getScraperOptions('visaCal', '2024-01-01');

            SCRAPER_LOW_RESOURCE_FLAGS.forEach(flag => {
                expect(options.args).toContain(flag);
            });
        });

        it('should NOT include low resource flags when LOW_RESOURCES_MODE is false', async () => {
            vi.stubEnv('LOW_RESOURCES_MODE', 'false');
            const { getScraperOptions } = await import('../scrapers/core.js');
            const { SCRAPER_LOW_RESOURCE_FLAGS } = await import('../utils/constants.js');

            const options = getScraperOptions('visaCal', '2024-01-01');

            SCRAPER_LOW_RESOURCE_FLAGS.forEach(flag => {
                expect(options.args).not.toContain(flag);
            });
        });

        it('should block heavy resources in getPreparePage when LOW_RESOURCES_MODE is true', async () => {
            vi.stubEnv('LOW_RESOURCES_MODE', 'true');
            const { getPreparePage } = await import('../scrapers/core.js');

            const mockPage = {
                setDefaultNavigationTimeout: vi.fn(),
                setDefaultTimeout: vi.fn(),
                setRequestInterception: vi.fn(),
                on: vi.fn(),
                evaluateOnNewDocument: vi.fn(),
                setExtraHTTPHeaders: vi.fn(),
                goto: vi.fn()
            };

            const preparePage = getPreparePage({ skipInterception: false });
            await preparePage(mockPage);

            const requestCall = mockPage.on.mock.calls.find(call => call[0] === 'request');
            if (!requestCall) throw new Error('Request listener not registered');
            const requestListener = requestCall[1];

            const mockRequest = {
                isInterceptResolutionHandled: () => false,
                url: () => 'https://example.com/image.png',
                resourceType: () => 'image',
                abort: vi.fn(),
                continue: vi.fn()
            };

            await requestListener(mockRequest);
            expect(mockRequest.abort).toHaveBeenCalled();
        });

        it('should NOT block heavy resources in getPreparePage when LOW_RESOURCES_MODE is false', async () => {
            vi.stubEnv('LOW_RESOURCES_MODE', 'false');
            const { getPreparePage } = await import('../scrapers/core.js');

            const mockPage = {
                setDefaultNavigationTimeout: vi.fn(),
                setDefaultTimeout: vi.fn(),
                setRequestInterception: vi.fn(),
                on: vi.fn(),
                evaluateOnNewDocument: vi.fn(),
                setExtraHTTPHeaders: vi.fn(),
                goto: vi.fn()
            };

            const preparePage = getPreparePage({ skipInterception: false });
            await preparePage(mockPage);

            const requestCall = mockPage.on.mock.calls.find(call => call[0] === 'request');
            if (!requestCall) throw new Error('Request listener not registered');
            const requestListener = requestCall[1];

            const mockRequest = {
                isInterceptResolutionHandled: () => false,
                url: () => 'https://example.com/image.png',
                resourceType: () => 'image',
                abort: vi.fn(),
                continue: vi.fn()
            };

            await requestListener(mockRequest);
            expect(mockRequest.abort).not.toHaveBeenCalled();
            expect(mockRequest.continue).toHaveBeenCalled();
        });
    });

    describe('Database Configuration', () => {
        it('should set database pool max to 5 when LOW_RESOURCES_MODE is true', async () => {
            vi.stubEnv('LOW_RESOURCES_MODE', 'true');
            const { pool } = await import('../pages/api/db.js');
            expect(pool.options.max).toBe(5);
        });

        it('should set database pool max to 20 when LOW_RESOURCES_MODE is false', async () => {
            vi.stubEnv('LOW_RESOURCES_MODE', 'false');
            const { pool } = await import('../pages/api/db.js');
            expect(pool.options.max).toBe(20);
        });
    });
});
