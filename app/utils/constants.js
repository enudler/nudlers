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
    '--disable-gl-drawing-for-tests',
    '--mute-audio',
    '--no-zygote',
    '--disable-accelerated-2d-canvas',
    '--disable-canvas-aa',
    '--disable-2d-canvas-clip-aa',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-offer-upload-credit-cards',
    '--disable-print-preview',
    '--disable-speech-api',
    '--disable-wake-on-wifi',
    '--disk-cache-size=0',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-datasaver-prompt',
    '--disable-features=TranslateUI,IsolateOrigins,site-per-process',
    '--force-color-profile=srgb',
    '--blink-settings=imagesEnabled=false',
];

// Timeout Settings
export const DEFAULT_SCRAPER_TIMEOUT = 90000;
export const RATE_LIMIT_DELAY_MIN = 1000;
export const RATE_LIMIT_DELAY_MAX = 4000;
export const RATE_LIMIT_SLOW_DELAY_MIN = 5000;
export const RATE_LIMIT_SLOW_DELAY_MAX = 10000;
export const DEFAULT_PROTOCOL_TIMEOUT = 180000;

// Scraper Phase 3 (Selective API Calls)
export const SCRAPER_PHASE3_MAX_CALLS = 200;
export const SCRAPER_PHASE3_DELAY = 1000;
export const SCRAPER_PHASE3_BATCH_SIZE = 5;

// App Settings Keys
export const APP_SETTINGS_KEYS = {
    FETCH_CATEGORIES: 'fetch_categories_from_scrapers',
    ISRACARD_SCRAPE_CATEGORIES: 'isracard_scrape_categories',
    UPDATE_CATEGORY_ON_RESCRAPE: 'update_category_on_rescrape',
    LOG_HTTP_REQUESTS: 'scraper_log_http_requests',
    SCRAPER_TIMEOUT: 'scraper_timeout',
    BILLING_CYCLE_START_DAY: 'billing_cycle_start_day',
    SYNC_ENABLED: 'sync_enabled',
    SYNC_DAYS_BACK: 'sync_days_back',
    DEFAULT_CURRENCY: 'default_currency',
    DATE_FORMAT: 'date_format',
    WHATSAPP_ENABLED: 'whatsapp_enabled',
    WHATSAPP_HOUR: 'whatsapp_hour',
    WHATSAPP_TWILIO_SID: 'whatsapp_twilio_sid',
    WHATSAPP_TWILIO_AUTH_TOKEN: 'whatsapp_twilio_auth_token',
    WHATSAPP_TWILIO_FROM: 'whatsapp_twilio_from',
    WHATSAPP_TO: 'whatsapp_to',
    WHATSAPP_LAST_SENT_DATE: 'whatsapp_last_sent_date',
    GEMINI_MODEL: 'gemini_model',
    SYNC_LAST_RUN_AT: 'sync_last_run_at',
    SYNC_HOUR: 'sync_hour'
};


// SQL Queries for Settings
export const FETCH_SETTING_SQL = "SELECT value FROM app_settings WHERE key = $1";
