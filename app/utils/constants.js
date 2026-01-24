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

// Timeout Settings (configurable via env for NAS tuning)
export const DEFAULT_SCRAPER_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '90000', 10);
export const DEFAULT_SCRAPE_RETRIES = parseInt(process.env.SCRAPER_RETRIES || '3', 10);
export const RATE_LIMIT_DELAY_MIN = 1000;
export const RATE_LIMIT_DELAY_MAX = 4000;
export const RATE_LIMIT_SLOW_DELAY_MIN = 5000;
export const RATE_LIMIT_SLOW_DELAY_MAX = 10000;
export const DEFAULT_PROTOCOL_TIMEOUT = parseInt(process.env.SCRAPER_PROTOCOL_TIMEOUT || '180000', 10);

// Scraper Phase 3 (Selective API Calls)
export const SCRAPER_PHASE3_MAX_CALLS = parseInt(process.env.SCRAPER_PHASE3_MAX_CALLS || '200', 10);
export const SCRAPER_PHASE3_DELAY = 1000;
export const SCRAPER_PHASE3_BATCH_SIZE = 5;

// Cache sizes (reduce for NAS/low-memory environments)
const LOW_RESOURCES = process.env.LOW_RESOURCES_MODE === 'true';
export const CATEGORY_CACHE_LIMIT = parseInt(process.env.CATEGORY_CACHE_LIMIT || (LOW_RESOURCES ? '200' : '300'), 10);
export const HISTORY_CACHE_LIMIT = parseInt(process.env.HISTORY_CACHE_LIMIT || (LOW_RESOURCES ? '1000' : '3000'), 10);

// Screenshot retention (days) - older screenshots are cleaned up on startup
export const SCREENSHOT_RETENTION_DAYS = parseInt(process.env.SCREENSHOT_RETENTION_DAYS || '7', 10);

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
