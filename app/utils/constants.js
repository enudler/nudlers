// Credit card vendors
export const CREDIT_CARD_VENDORS = ['visaCal', 'max', 'isracard', 'amex'];

// Bank vendors (standard format: id, password, num)
export const STANDARD_BANK_VENDORS = ['hapoalim', 'poalim', 'leumi', 'mizrahi', 'discount', 'yahav', 'union', 'fibi', 'jerusalem', 'onezero', 'pepper'];

// Beinleumi Group banks (special format: username, password only)
export const BEINLEUMI_GROUP_VENDORS = ['otsarHahayal', 'otsar_hahayal', 'beinleumi', 'massad', 'pagi'];

// All bank vendors
export const BANK_VENDORS = [...STANDARD_BANK_VENDORS, ...BEINLEUMI_GROUP_VENDORS];

// All vendors
export const ALL_VENDORS = [...CREDIT_CARD_VENDORS, ...BANK_VENDORS];

// Browser / Anti-detection
export const CHROME_VERSION = '132.0.6834.83';
export const DEFAULT_USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;

// Browser Flags
export const SCRAPER_DOCKER_FLAGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
];

export const SCRAPER_LOW_RESOURCE_FLAGS = [
    // Process optimization (critical for NAS)
    '--single-process',
    '--no-zygote',
    '--disable-extensions',
    // Memory optimization
    '--js-flags=--max-old-space-size=256',
    '--disable-gl-drawing-for-tests',
    '--disable-accelerated-2d-canvas',
    '--disable-canvas-aa',
    '--disable-2d-canvas-clip-aa',
    '--disk-cache-size=0',
    '--media-cache-size=0',
    '--aggressive-cache-discard',
    // Disable unnecessary features (note: --disable-default-apps and --disable-sync are in base args)
    '--mute-audio',
    '--disable-audio-output',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-offer-upload-credit-cards',
    '--disable-print-preview',
    '--disable-speech-api',
    '--disable-wake-on-wifi',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-datasaver-prompt',
    '--disable-domain-reliability',
    // Background throttling (keep Chrome idle when not active)
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-hang-monitor',
    // Feature disabling
    '--disable-features=TranslateUI,IsolateOrigins,site-per-process,BackForwardCache,BlinkGenPropertyTrees',
    '--force-color-profile=srgb',
    '--blink-settings=imagesEnabled=false',
];

// Ultra-low resource mode flags for very constrained NAS (Raspberry Pi, low-end Synology, etc.)
// These flags provide even more aggressive memory optimization at the cost of some functionality
export const SCRAPER_ULTRA_LOW_RESOURCE_FLAGS = [
    ...SCRAPER_LOW_RESOURCE_FLAGS,
    // Even more aggressive memory limits
    '--js-flags=--max-old-space-size=128,--optimize-for-size,--gc-interval=100',
    // Disable more features
    '--disable-logging',
    '--disable-web-security',
    '--disable-plugins',
    '--disable-popup-blocking',
    '--disable-translate',
    '--disable-infobars',
    '--disable-session-crashed-bubble',
    // Reduce memory usage
    '--memory-pressure-off',
    '--renderer-process-limit=1',
    '--disable-breakpad',
    '--disable-checker-imaging',
    '--disable-composited-antialiasing',
    // Disable more Chrome features
    '--disable-ipc-flooding-protection',
    '--disable-partial-raster',
    '--disable-skia-runtime-opts',
    // Force lower quality rendering
    '--force-device-scale-factor=1',
    '--disable-lcd-text',
    '--disable-font-subpixel-positioning',
].filter((flag, index, self) => {
    // Remove duplicate --js-flags by keeping only the last one
    if (flag.startsWith('--js-flags=')) {
        const lastJsFlagsIndex = self.map((f, i) => f.startsWith('--js-flags=') ? i : -1).filter(i => i !== -1).pop();
        return index === lastJsFlagsIndex;
    }
    return true;
});

// Timeout Settings
export const DEFAULT_SCRAPER_TIMEOUT = 90000;
export const DEFAULT_SCRAPE_RETRIES = 3;
export const RATE_LIMIT_DELAY_MIN = 1000;
export const RATE_LIMIT_DELAY_MAX = 4000;
export const RATE_LIMIT_SLOW_DELAY_MIN = 5000;
export const RATE_LIMIT_SLOW_DELAY_MAX = 10000;
export const DEFAULT_PROTOCOL_TIMEOUT = 180000;

// Scraper Phase 3 (Selective API Calls)
// For NAS with limited resources, reduce max calls and batch size
const isUltraLowResource = process.env.ULTRA_LOW_RESOURCES_MODE === 'true';
const isLowResource = process.env.LOW_RESOURCES_MODE === 'true';
export const SCRAPER_PHASE3_MAX_CALLS = isUltraLowResource ? 50 : (isLowResource ? 100 : 200);
export const SCRAPER_PHASE3_DELAY = isUltraLowResource ? 2000 : 1000;
export const SCRAPER_PHASE3_BATCH_SIZE = isUltraLowResource ? 2 : (isLowResource ? 3 : 5);

// App Settings Keys
export const APP_SETTINGS_KEYS = {
    FETCH_CATEGORIES: 'fetch_categories_from_scrapers',
    ISRACARD_SCRAPE_CATEGORIES: 'isracard_scrape_categories',
    UPDATE_CATEGORY_ON_RESCRAPE: 'update_category_on_rescrape',
    LOG_HTTP_REQUESTS: 'scraper_log_http_requests',
    SCRAPER_TIMEOUT: 'scraper_timeout',
    SCRAPE_RETRIES: 'scrape_retries',
    BILLING_CYCLE_START_DAY: 'billing_cycle_start_day',
    SYNC_ENABLED: 'sync_enabled',
    SYNC_DAYS_BACK: 'sync_days_back',
    DEFAULT_CURRENCY: 'default_currency',
    DATE_FORMAT: 'date_format',
    WHATSAPP_ENABLED: 'whatsapp_enabled',
    WHATSAPP_HOUR: 'whatsapp_hour',
    WHATSAPP_TO: 'whatsapp_to',
    WHATSAPP_LAST_SENT_DATE: 'whatsapp_last_sent_date',
    WHATSAPP_SUMMARY_MODE: 'whatsapp_summary_mode',
    GEMINI_MODEL: 'gemini_model',
    SYNC_LAST_RUN_AT: 'sync_last_run_at',
    SYNC_HOUR: 'sync_hour'
};


// SQL Queries for Settings
export const FETCH_SETTING_SQL = "SELECT value FROM app_settings WHERE key = $1";
