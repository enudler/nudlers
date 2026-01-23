import {
    CHROME_VERSION,
    DEFAULT_USER_AGENT,
    DEFAULT_SCRAPER_TIMEOUT,
    DEFAULT_PROTOCOL_TIMEOUT,
    CREDIT_CARD_VENDORS,
    SCRAPER_DOCKER_FLAGS,
    SCRAPER_LOW_RESOURCE_FLAGS
} from '../utils/constants.js';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import logger from '../utils/logger.js';

// Vendors that are rate-limited and need special handling (delays, longer timeouts, etc.)
export const RATE_LIMITED_VENDORS = CREDIT_CARD_VENDORS;

/**
 * Shared sleep helper
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// Active session tracking for manual screenshots (using global to survive HMR/isolation)
if (!global.scraperActiveSession) {
    global.scraperActiveSession = {
        page: null,
        onProgress: null,
        companyId: null
    };
}

/**
 * Register the active scraper session
 */
export function registerActiveSession(page, companyId, onProgress) {
    global.scraperActiveSession = { page, companyId, onProgress };
}

/**
 * Clear the active scraper session
 */
export function clearActiveSession() {
    global.scraperActiveSession = { page: null, companyId: null, onProgress: null };
}

/**
 * Take a screenshot of the currently active session
 */
export async function takeManualScreenshot() {
    if (!global.scraperActiveSession.page) {
        throw new Error('No active scraper session found');
    }
    return await saveScreenshot(
        global.scraperActiveSession.page,
        global.scraperActiveSession.companyId || 'manual',
        'manual-trigger',
        global.scraperActiveSession.onProgress
    );
}

/**
 * Save a screenshot from a Puppeteer page
 */
export async function saveScreenshot(page, companyId, stepName, onProgress = null) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${companyId}-${stepName}-${timestamp}.png`;
        const screenshotsDir = path.join(process.cwd(), 'public', 'debug', 'screenshots');

        if (!existsSync(screenshotsDir)) {
            await fs.mkdir(screenshotsDir, { recursive: true });
        }

        const filePath = path.join(screenshotsDir, filename);
        await page.screenshot({ path: filePath, fullPage: true });
        logger.info({ filename }, 'Screenshot saved');

        if (onProgress) {
            onProgress(companyId, {
                type: 'screenshot',
                filename,
                url: `/api/debug/view_image?file=${filename}`,
                stepName,
                timestamp: new Date().toISOString()
            });
        }

        return filename;
    } catch (err) {
        logger.error({ err: err.message, companyId, stepName }, 'Failed to save screenshot');
        return null;
    }
}

const LOW_RESOURCES_MODE = process.env.LOW_RESOURCES_MODE === 'true';

/**
 * Get Chromium/Chrome executable path based on OS/Environment.
 * Returning undefined allows Puppeteer to find its bundled "Chrome for Testing".
 */
export function getChromePath() {
    // 1. If explicitly set via environment variable (e.g., in Docker), use it.
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // 2. Default: Return undefined. 
    // Puppeteer 22+ will automatically look in ~/.cache/puppeteer for the 
    // bundled "Chrome for Testing" binary. This is the most reliable way 
    // to "make sure it's Chrome for Testing" across macOS, Windows, and Linux.
    return undefined;
}

/**
 * Get scraper options with generic defaults
 */
export function getScraperOptions(companyId, startDate, options = {}) {
    const showBrowser = options.showBrowser ?? false;
    const fetchCategories = options.fetchCategories ?? true;
    const userAgent = DEFAULT_USER_AGENT;

    // Use minimalist args as the default for all vendors
    const args = [...SCRAPER_DOCKER_FLAGS];

    // Specific flag for Visa Cal to avoid net::ERR_HTTP2_PROTOCOL_ERROR
    if (companyId === 'visaCal') {
        args.push('--disable-http2');
    }

    if (LOW_RESOURCES_MODE) {
        args.push(...SCRAPER_LOW_RESOURCE_FLAGS);
    }

    // Add safe standard args for all vendors
    args.push(
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        `--user-agent=${userAgent}`,
        '--lang=he-IL,he,en-US,en',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync'
    );

    if (showBrowser) {
        const debugPort = options.debugPort || 9223;
        args.push(`--remote-debugging-port=${debugPort}`);
        args.push('--remote-debugging-address=127.0.0.1');
    } else {
        args.push('--headless=new');
    }

    const isRateLimited = RATE_LIMITED_VENDORS.includes(companyId);

    // Default timeout
    const timeout = options.timeout || DEFAULT_SCRAPER_TIMEOUT;

    const skipInterception = companyId === 'max' || options.skipInterception === true;

    return {
        companyId,
        startDate,
        combineInstallments: false,
        additionalTransactionInformation: fetchCategories,
        showBrowser,
        headless: showBrowser ? false : 'new',
        verbose: options.verbose ?? true,
        timeout,
        defaultTimeout: timeout,
        protocolTimeout: options.protocolTimeout || DEFAULT_PROTOCOL_TIMEOUT,
        executablePath: getChromePath(),
        args,
        viewportSize: { width: 1920, height: 1080 },
        isRateLimited,
        skipInterception,
        ...options
    };
}

/**
 * Get preparePage function with anti-detection measures
 */
export function getPreparePage(options = {}) {
    const logRequests = options.logRequests ?? true;
    const onProgress = options.onProgress;
    const forceSlowMode = options.forceSlowMode;
    const isRateLimited = options.isRateLimited ?? false;
    const timeout = options.timeout ?? DEFAULT_SCRAPER_TIMEOUT;

    return async (page) => {
        // Set higher navigation and execution timeouts to avoid defaults
        await page.setDefaultNavigationTimeout(timeout);
        await page.setDefaultTimeout(timeout);

        // Inject screenshot helper into page object
        page.takeScreenshot = (stepName) => saveScreenshot(page, options.companyId || 'unknown', stepName, onProgress);

        // Register session for manual trigger
        registerActiveSession(page, options.companyId, onProgress);

        const randomDelay = (min, max) => new Promise(resolve =>
            setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
        );

        const skipInterception = options.skipInterception ?? false;

        if (!skipInterception) {
            // Enable request interception to block analytics and prevent hangs
            await page.setRequestInterception(true);
        }
        page.on('request', async (request) => {
            try {
                // If it's already handled by another listener (like the library's internal one), stop here.
                if (request.isInterceptResolutionHandled()) return;

                const url = request.url();


                // Block Google Analytics and Tag Manager to prevent timeouts
                if (!skipInterception) {
                    if (url.includes('google-analytics.com') || url.includes('googletagmanager.com')) {
                        try {
                            request.abort();
                            return;
                        } catch (e) {
                            return;
                        }
                    }

                    // Low resource mode: Block heavy resources
                    if (LOW_RESOURCES_MODE) {
                        const resourceType = request.resourceType();
                        if (['image', 'media', 'font', 'texttrack', 'object', 'beacon', 'csp_report', 'imageset'].includes(resourceType)) {
                            try {
                                request.abort();
                                return;
                            } catch (e) {
                                return;
                            }
                        }
                    }
                }

                // Log all HTTP requests for debugging rate limiting
                if (logRequests) {
                    const resourceType = request.resourceType();
                    // Focus on API calls (xhr/fetch), skip images/css/fonts for cleaner logs
                    if (resourceType === 'xhr' || resourceType === 'fetch' || resourceType === 'document') {
                        const logData = {
                            level: 'info',
                            msg: '[Scraper HTTP Request]',
                            method: request.method(),
                            url: request.url(),
                            resourceType,
                            timestamp: new Date().toISOString()
                        };
                        logger.info(logData);

                        if (onProgress) {
                            onProgress('network', {
                                type: 'httpRequest',
                                message: `${request.method()} ${request.url()}`,
                                method: request.method(),
                                url: request.url(),
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }

                if (!skipInterception) {
                    try {
                        if (!request.isInterceptResolutionHandled()) {
                            request.continue();
                        }
                    } catch (e) {
                        // ignore if already handled
                    }
                }
            } catch (err) {
                // Prevent unhandled rejections from within the listener
                logger.error({ err: err.message }, 'Scraper Interception Error');
            }
        });

        // Also log responses to see status codes (only if logging is enabled)
        if (logRequests) {
            page.on('response', async (response) => {
                const request = response.request();
                const resourceType = request.resourceType();
                const url = request.url();

                if (resourceType === 'xhr' || resourceType === 'fetch' || resourceType === 'document') {
                    const status = response.status();
                    // Highlight rate limiting responses (429) or errors
                    const level = status === 429 ? 'warn' : (status >= 400 ? 'error' : 'debug');
                    const logData = {
                        level,
                        msg: '[Scraper HTTP Response]',
                        status,
                        url,
                        resourceType,
                        timestamp: new Date().toISOString()
                    };

                    // Enhanced logging for specific Visa Cal endpoints to debug failures
                    if (url.includes('GetFrameStatus') || url.includes('Authentication/api/account/init')) {
                        try {
                            const text = await response.text();
                            logData.responseText = text;
                        } catch (e) {
                            logData.responseTextError = e.message;
                        }
                    }

                    logger.info(logData);

                    if (onProgress) {
                        onProgress('network', {
                            type: 'httpResponse',
                            message: `${status} ${url}`,
                            status,
                            url,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            });
        }


        await page.evaluateOnNewDocument((options) => {
            // In-Page Throttling for Isracard/Amex to avoid 429 "Block Automation"
            const isIsracardOrAmex = options.companyId === 'isracard' || options.companyId === 'amex';
            if (isIsracardOrAmex) {
                const originalFetch = window.fetch;
                window.fetch = async function (...args) {
                    const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                    if (url && (url.includes('DashboardMonth') || url.includes('CardsTransactionsList'))) {
                        const delay = 1000;
                        // Throttled fetch
                        await new Promise(r => setTimeout(r, delay));
                    }
                    return originalFetch.apply(this, args);
                };

                const originalOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                    this._url = url;
                    return originalOpen.apply(this, [method, url, ...rest]);
                };

                const originalSend = XMLHttpRequest.prototype.send;
                XMLHttpRequest.prototype.send = function (...args) {
                    const url = this._url || '';
                    if (url && (url.includes('DashboardMonth') || url.includes('CardsTransactionsList'))) {
                        // Throttled XHR
                    }
                    return originalSend.apply(this, args);
                };
            }

            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            try { delete Object.getPrototypeOf(navigator).webdriver; } catch (e) { }
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const pluginData = [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
                    ];
                    const plugins = pluginData.map(p => {
                        const plugin = Object.create(Plugin.prototype);
                        Object.defineProperties(plugin, {
                            name: { value: p.name },
                            filename: { value: p.filename },
                            description: { value: p.description },
                            length: { value: 0 },
                        });
                        return plugin;
                    });
                    const pluginArray = Object.create(PluginArray.prototype);
                    plugins.forEach((p, i) => { pluginArray[i] = p; });
                    Object.defineProperty(pluginArray, 'length', { value: plugins.length });
                    return pluginArray;
                },
            });
            Object.defineProperty(navigator, 'languages', { get: () => ['he-IL', 'he', 'en-US', 'en'] });

            // Mock permissions
            if (window.navigator.permissions) {
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: 'denied' }) :
                        originalQuery(parameters)
                );
            }

            window.chrome = {
                runtime: {
                    id: undefined,
                    connect: () => { },
                    sendMessage: () => { },
                    onMessage: { addListener: () => { } },
                    onConnect: { addListener: () => { } },
                }
            };

            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
            Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });

            // Additional anti-detection for specific banks
            if (options.companyId === 'hapoalim' || options.companyId === 'discount') {
                // Override connection API
                if (navigator.connection) {
                    Object.defineProperty(navigator, 'connection', {
                        get: () => ({
                            effectiveType: '4g',
                            rtt: 50,
                            downlink: 10,
                            saveData: false
                        })
                    });
                }

                // Add more realistic browser properties
                Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
                Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
                Object.defineProperty(navigator, 'vendorSub', { get: () => '' });
            }
        }, options);

        // Set comprehensive headers to avoid bot detection
        const chromeVersion = CHROME_VERSION;
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-CH-UA': `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not=A?Brand";v="8"`,
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': '"macOS"',
            'Sec-CH-UA-Arch': '"x86"',
            'Sec-CH-UA-Bitness': '"64"',
            'Sec-CH-UA-Model': '""',
        });

        // Add navigation delays for rate-limited vendors
        if (isRateLimited) {
            const originalGoto = page.goto.bind(page);
            page.goto = async (url, options) => {
                // Cap delay at 5 seconds, and only if rate limited (unless forced slow mode)
                let delayMs;
                if (forceSlowMode) {
                    // Slower delay for detected rate limits: 5-10s
                    delayMs = Math.floor(Math.random() * 5000) + 5000;
                } else {
                    // Standard rate limited vendors: 1-4s
                    delayMs = Math.min(Math.floor(Math.random() * 3000) + 1000, 5000);
                }

                if (onProgress) {
                    onProgress('network', {
                        type: 'rateLimitWait',
                        message: `Waiting ${Math.round(delayMs / 1000)}s (rate limit)...`,
                        seconds: delayMs / 1000
                    });
                }

                await randomDelay(delayMs / 2, delayMs);

                if (onProgress) {
                    onProgress('network', {
                        type: 'progress',
                        message: 'Navigating to page...',
                        phase: 'network'
                    });
                    onProgress('network', {
                        type: 'rateLimitFinished',
                        timestamp: new Date().toISOString()
                    });
                }

                return originalGoto(url, options);
            };
        }

    };
}
