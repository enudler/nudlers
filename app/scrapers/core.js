/**
 * Core Scraper logic that doesn't depend on DB or heavy utils.
 * Safe to import in standalone scripts/workers.
 */

// Vendors that are rate-limited and need special handling (delays, longer timeouts, etc.)
export const RATE_LIMITED_VENDORS = ['isracard', 'amex', 'max', 'visaCal'];


/**
 * Shared sleep helper
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
 * Get scraper options with anti-detection measures
 */
export function getScraperOptions(companyId, startDate, options = {}) {
    const showBrowser = options.showBrowser ?? false;
    const fetchCategories = options.fetchCategories ?? true;

    const chromeVersion = '132.0.6834.83';
    const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

    const baseArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
        // Removed --disable-web-security as it can trigger security warnings
        `--user-agent=${userAgent}`,
        '--disable-infobars',
        '--disable-extensions',
        '--lang=he-IL,he,en-US,en',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-gpu',
        '--disable-software-rasterizer',
    ];

    if (LOW_RESOURCES_MODE) {
        baseArgs.push(
            '--disable-gl-drawing-for-tests',
            '--mute-audio',
            '--no-zygote',
            '--disable-accelerated-2d-canvas',
            '--disable-dev-shm-usage',
            '--disable-notifications',
            '--disable-offer-store-unmasked-wallet-cards',
            '--disable-offer-upload-credit-cards',
            '--disable-print-preview',
            '--disable-speech-api',
            '--disable-wake-on-wifi',
            '--disk-cache-size=0' // Disable disk cache to save IO
        );
    }

    if (showBrowser) {
        // Use a configurable port or default to 9223 to avoid conflicts with existing Chrome instances
        // Port 9222 is commonly used by other Chrome instances
        const debugPort = options.debugPort || 9223;
        baseArgs.push(`--remote-debugging-port=${debugPort}`);
        // Use localhost only to reduce detection surface
        baseArgs.push('--remote-debugging-address=127.0.0.1');
    } else {
        baseArgs.push('--headless=new');
    }

    let timeout = options.timeout || 60000;

    if (companyId === 'leumi') {
        // For Leumi, use minimal options to match the library's default behavior
        return {
            companyId,
            startDate,
            combineInstallments: false,
            additionalTransactionInformation: fetchCategories,
            showBrowser,
            headless: showBrowser ? false : 'new',
            verbose: options.verbose ?? true,
            timeout,
            executablePath: getChromePath(),
            // No custom args or viewport overrides for Leumi - STRICTLY default
            // args: [], // Puppeteer usage of undefined args uses defaults
            ...options
        };
    }

    return {
        companyId,
        startDate,
        combineInstallments: false,
        additionalTransactionInformation: fetchCategories,
        showBrowser,
        headless: showBrowser ? false : 'new',
        verbose: options.verbose ?? true,
        timeout,
        executablePath: getChromePath(),
        args: baseArgs,
        viewportSize: { width: 1920, height: 1080 },
        defaultTimeout: timeout,
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
    const timeout = options.timeout ?? 60000;

    return async (page) => {
        // Set higher navigation and execution timeouts to avoid defaults
        await page.setDefaultNavigationTimeout(timeout);
        await page.setDefaultTimeout(timeout);

        const randomDelay = (min, max) => new Promise(resolve =>
            setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
        );

        const skipInterception = options.skipInterception ?? false;

        if (!skipInterception) {
            // Enable request interception to block analytics and prevent hangs
            await page.setRequestInterception(true);
        }

        page.on('request', (request) => {
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
                        console.log(JSON.stringify(logData));

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
                console.error('[Scraper Interception Error]', err.message);
            }
        });

        // Also log responses to see status codes (only if logging is enabled)
        if (logRequests) {
            page.on('response', (response) => {
                const request = response.request();
                const resourceType = request.resourceType();
                if (resourceType === 'xhr' || resourceType === 'fetch' || resourceType === 'document') {
                    const status = response.status();
                    // Highlight rate limiting responses (429) or errors
                    const level = status === 429 ? 'warn' : (status >= 400 ? 'error' : 'debug');
                    const logData = {
                        level,
                        msg: '[Scraper HTTP Response]',
                        status,
                        url: request.url(),
                        resourceType,
                        timestamp: new Date().toISOString()
                    };
                    console.log(JSON.stringify(logData));

                    if (onProgress) {
                        onProgress('network', {
                            type: 'httpResponse',
                            message: `${status} ${request.url()}`,
                            status,
                            url: request.url(),
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
                        const delay = 4000;
                        // Use CSS-styled log if in browser console, or simple log
                        console.log(`%c[Throttler] Throttling fetch for ${url.split('reqName=')[1]?.split('&')[0] || 'data'} (${delay}ms)`, 'color: orange; font-weight: bold;');
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
                        console.log(`[Throttler] XHR detected for ${url}`);
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

            // Additional anti-detection for Leumi and other banks
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
        const chromeVersion = '132.0.6834.83';
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-CH-UA': `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not=A?Brand";v="8"`,
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': '"macOS"',
            'Sec-CH-UA-Arch': '"x86"',
            'Sec-CH-UA-Bitness': '"64"',
            'Sec-CH-UA-Model': '""',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        });

        // Add navigation delays for rate-limited vendors (including Leumi)
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
                return originalGoto(url, options);
            };
        }

    };
}
