/**
 * Core Scraper logic that doesn't depend on DB or heavy utils.
 * Safe to import in standalone scripts/workers.
 */

export const RATE_LIMITED_VENDORS = [];

/**
 * Shared sleep helper
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get Chromium executable path based on OS/Environment
 */
export function getChromePath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    if (process.platform === 'win32') {
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } else if (process.platform === 'darwin') {
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else {
        return '/usr/bin/chromium';
    }
}

/**
 * Get scraper options with anti-detection measures
 */
export function getScraperOptions(companyId, startDate, isIsracardAmex, options = {}) {
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
        '--disable-web-security',
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
    ];

    if (showBrowser) {
        baseArgs.push('--remote-debugging-port=9222');
        baseArgs.push('--remote-debugging-address=0.0.0.0');
    }

    let timeout = options.timeout;
    if (!timeout) {
        timeout = isIsracardAmex ? 120000 : 60000;
    }

    return {
        companyId,
        startDate,
        combineInstallments: false,
        additionalTransactionInformation: fetchCategories,
        showBrowser,
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
export function getPreparePage(isIsracardAmex) {
    return async (page) => {
        const randomDelay = (min, max) => new Promise(resolve =>
            setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
        );

        if (isIsracardAmex) {
            await randomDelay(2000, 5000);
        }

        await page.evaluateOnNewDocument(() => {
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
        });

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-CH-UA-Platform': '"macOS"',
        });

        if (isIsracardAmex) {
            const originalGoto = page.goto.bind(page);
            page.goto = async (url, options) => {
                await randomDelay(1500, 4000);
                return originalGoto(url, options);
            };
        }
    };
}
