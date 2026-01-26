/**
 * Resource Optimization Configuration System
 *
 * This module provides a unified configuration for all resource-related optimizations.
 * Settings are organized into logical groups and can be controlled via:
 *
 * 1. RESOURCE_MODE environment variable (normal | low | ultra-low)
 * 2. Individual environment variable overrides
 * 3. Legacy LOW_RESOURCES_MODE / ULTRA_LOW_RESOURCES_MODE flags
 *
 * Priority: Individual env var > RESOURCE_MODE preset > Legacy flags > defaults
 */

import logger from '../utils/logger.js';

// =============================================================================
// Resource Mode Presets
// =============================================================================

const PRESETS = {
    // Normal mode: Standard servers with 2GB+ RAM
    normal: {
        memory: {
            nodeHeapMB: 1024,          // Node.js --max-old-space-size
            chromeHeapMB: 512,         // Chrome js-flags heap for scrapers
            whatsappHeapMB: 512,       // WhatsApp Chrome heap (needs more for encryption)
            shmSizeMB: 512,            // Docker shared memory
        },
        database: {
            poolSize: 20,              // Max database connections
            idleTimeoutMs: 30000,      // Idle connection cleanup
            connectionTimeoutMs: 5000, // Connection timeout
            retryAttempts: 3,          // Retry on failure
            retryDelayMs: 2000,        // Backoff between retries
        },
        scraper: {
            timeout: 90000,            // Default scraper timeout
            protocolTimeout: 180000,   // Chrome DevTools protocol timeout
            retries: 3,                // Scrape retry attempts
            phase3MaxCalls: 200,       // Max API calls in phase 3
            phase3DelayMs: 1000,       // Delay between batches
            phase3BatchSize: 5,        // Calls per batch
        },
        cache: {
            categoryCacheLimit: 300,   // Category lookup cache
            historyCacheLimit: 3000,   // Transaction history cache
        },
        display: {
            xvfbWidth: 1280,
            xvfbHeight: 720,
            xvfbDepth: 24,
            viewportWidth: 1280,
            viewportHeight: 720,
        },
        cleanup: {
            screenshotRetentionDays: 7,
            maxScreenshots: 100,
            logLevel: 'info',
        },
        resources: {
            blockHeavyResources: false, // Don't block images/fonts in normal mode
            singleProcess: false,       // Use multi-process Chrome
        },
    },

    // Low mode: Standard NAS (Synology DS220+, QNAP)
    low: {
        memory: {
            nodeHeapMB: 768,
            chromeHeapMB: 256,
            whatsappHeapMB: 256,
            shmSizeMB: 512,
        },
        database: {
            poolSize: 5,
            idleTimeoutMs: 20000,
            connectionTimeoutMs: 5000,
            retryAttempts: 3,
            retryDelayMs: 2000,
        },
        scraper: {
            timeout: 90000,
            protocolTimeout: 180000,
            retries: 3,
            phase3MaxCalls: 200,
            phase3DelayMs: 1000,
            phase3BatchSize: 5,
        },
        cache: {
            categoryCacheLimit: 200,
            historyCacheLimit: 1000,
        },
        display: {
            xvfbWidth: 1280,
            xvfbHeight: 720,
            xvfbDepth: 24,
            viewportWidth: 1280,
            viewportHeight: 720,
        },
        cleanup: {
            screenshotRetentionDays: 7,
            maxScreenshots: 100,
            logLevel: 'warn',
        },
        resources: {
            blockHeavyResources: true,
            singleProcess: true,
        },
    },

    // Ultra-low mode: Raspberry Pi, low-end Synology, minimal RAM
    'ultra-low': {
        memory: {
            nodeHeapMB: 512,
            chromeHeapMB: 128,
            whatsappHeapMB: 128,
            shmSizeMB: 256,
        },
        database: {
            poolSize: 3,
            idleTimeoutMs: 15000,
            connectionTimeoutMs: 10000,
            retryAttempts: 5,
            retryDelayMs: 3000,
        },
        scraper: {
            timeout: 120000,
            protocolTimeout: 240000,
            retries: 5,
            phase3MaxCalls: 100,
            phase3DelayMs: 1500,
            phase3BatchSize: 3,
        },
        cache: {
            categoryCacheLimit: 100,
            historyCacheLimit: 500,
        },
        display: {
            xvfbWidth: 1280,
            xvfbHeight: 720,
            xvfbDepth: 24,
            viewportWidth: 1280,
            viewportHeight: 720,
        },
        cleanup: {
            screenshotRetentionDays: 3,
            maxScreenshots: 50,
            logLevel: 'warn',
        },
        resources: {
            blockHeavyResources: true,
            singleProcess: true,
        },
    },
};

// =============================================================================
// Chrome Flags Configuration
// =============================================================================

const CHROME_FLAGS = {
    // Base flags - always applied (required for Docker/sandboxing)
    base: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
    ],

    // Standard flags for all modes
    standard: [
        '--disable-blink-features=AutomationControlled',
        '--lang=he-IL,he,en-US,en',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
    ],

    // Low resource flags - added for low/ultra-low modes
    lowResource: [
        // Process optimization (critical for limited resources)
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        // Memory optimization
        '--disable-gl-drawing-for-tests',
        '--disable-accelerated-2d-canvas',
        '--disable-canvas-aa',
        '--disable-2d-canvas-clip-aa',
        '--disk-cache-size=0',
        '--media-cache-size=0',
        '--aggressive-cache-discard',
        // Disable unnecessary features
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
        // Background throttling
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-hang-monitor',
        // Feature disabling
        '--disable-features=TranslateUI,IsolateOrigins,site-per-process,BackForwardCache,BlinkGenPropertyTrees',
        '--force-color-profile=srgb',
        '--blink-settings=imagesEnabled=false',
    ],

    // Ultra-low resource flags - additional aggressive flags
    ultraLowResource: [
        // Even more aggressive memory savings
        '--disable-breakpad',
        '--disable-crash-reporter',
        '--disable-logging',
        '--disable-infobars',
        '--disable-popup-blocking',
        '--no-pings',
    ],

    // WhatsApp-specific flags (NO --single-process as it breaks iframes)
    whatsapp: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-zygote',
        '--no-first-run',
        '--disable-extensions',
        '--disable-accelerated-2d-canvas',
        '--disable-canvas-aa',
        '--disable-2d-canvas-clip-aa',
        '--disk-cache-size=0',
        '--media-cache-size=0',
        '--mute-audio',
        '--disable-audio-output',
        '--disable-notifications',
        '--disable-print-preview',
        '--disable-speech-api',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // Keep site-per-process enabled for WhatsApp frame stability
        '--disable-features=TranslateUI,BackForwardCache',
    ],
};

// =============================================================================
// Configuration Builder
// =============================================================================

/**
 * Determine the active resource mode
 */
function getResourceMode() {
    // Priority 1: Explicit RESOURCE_MODE
    const explicitMode = process.env.RESOURCE_MODE;
    if (explicitMode && PRESETS[explicitMode]) {
        return explicitMode;
    }

    // Priority 2: Legacy flags
    if (process.env.ULTRA_LOW_RESOURCES_MODE === 'true') {
        return 'ultra-low';
    }
    if (process.env.LOW_RESOURCES_MODE === 'true') {
        return 'low';
    }

    // Default: normal mode
    return 'normal';
}

/**
 * Parse an integer from environment variable with fallback
 */
function envInt(name, fallback) {
    const val = process.env[name];
    if (val === undefined || val === '') return fallback;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse a string from environment variable with fallback
 */
function envStr(name, fallback) {
    return process.env[name] || fallback;
}

/**
 * Build the final resource configuration with environment overrides
 */
function buildConfig() {
    const mode = getResourceMode();
    const preset = PRESETS[mode];

    // Build config with environment variable overrides
    const config = {
        mode,

        memory: {
            nodeHeapMB: envInt('NODE_HEAP_MB', preset.memory.nodeHeapMB),
            chromeHeapMB: envInt('CHROME_HEAP_MB', preset.memory.chromeHeapMB),
            whatsappHeapMB: envInt('WHATSAPP_HEAP_MB', preset.memory.whatsappHeapMB),
            shmSizeMB: envInt('SHM_SIZE_MB', preset.memory.shmSizeMB),
        },

        database: {
            poolSize: envInt('DB_POOL_SIZE', preset.database.poolSize),
            idleTimeoutMs: envInt('DB_IDLE_TIMEOUT_MS', preset.database.idleTimeoutMs),
            connectionTimeoutMs: envInt('DB_CONNECTION_TIMEOUT_MS', preset.database.connectionTimeoutMs),
            retryAttempts: envInt('DB_RETRY_ATTEMPTS', preset.database.retryAttempts),
            retryDelayMs: envInt('DB_RETRY_DELAY_MS', preset.database.retryDelayMs),
        },

        scraper: {
            timeout: envInt('SCRAPER_TIMEOUT', preset.scraper.timeout),
            protocolTimeout: envInt('SCRAPER_PROTOCOL_TIMEOUT', preset.scraper.protocolTimeout),
            retries: envInt('SCRAPER_RETRIES', preset.scraper.retries),
            phase3MaxCalls: envInt('SCRAPER_PHASE3_MAX_CALLS', preset.scraper.phase3MaxCalls),
            phase3DelayMs: envInt('SCRAPER_PHASE3_DELAY_MS', preset.scraper.phase3DelayMs),
            phase3BatchSize: envInt('SCRAPER_PHASE3_BATCH_SIZE', preset.scraper.phase3BatchSize),
        },

        cache: {
            categoryCacheLimit: envInt('CATEGORY_CACHE_LIMIT', preset.cache.categoryCacheLimit),
            historyCacheLimit: envInt('HISTORY_CACHE_LIMIT', preset.cache.historyCacheLimit),
        },

        display: {
            xvfbWidth: envInt('XVFB_WIDTH', preset.display.xvfbWidth),
            xvfbHeight: envInt('XVFB_HEIGHT', preset.display.xvfbHeight),
            xvfbDepth: envInt('XVFB_DEPTH', preset.display.xvfbDepth),
            viewportWidth: envInt('VIEWPORT_WIDTH', preset.display.viewportWidth),
            viewportHeight: envInt('VIEWPORT_HEIGHT', preset.display.viewportHeight),
        },

        cleanup: {
            screenshotRetentionDays: envInt('SCREENSHOT_RETENTION_DAYS', preset.cleanup.screenshotRetentionDays),
            maxScreenshots: envInt('MAX_SCREENSHOTS', preset.cleanup.maxScreenshots),
            logLevel: envStr('LOG_LEVEL', preset.cleanup.logLevel),
        },

        resources: {
            blockHeavyResources: preset.resources.blockHeavyResources,
            singleProcess: preset.resources.singleProcess,
        },

        chromeFlags: CHROME_FLAGS,
    };

    return config;
}

// =============================================================================
// Exported Configuration
// =============================================================================

export const RESOURCE_CONFIG = buildConfig();

// Helper to check if we're in low resource mode (low or ultra-low)
export const isLowResourceMode = () => RESOURCE_CONFIG.mode === 'low' || RESOURCE_CONFIG.mode === 'ultra-low';
export const isUltraLowResourceMode = () => RESOURCE_CONFIG.mode === 'ultra-low';

/**
 * Get Chrome arguments for scrapers based on current resource mode
 * @param {Object} options - Additional options
 * @param {boolean} options.headless - Whether to run headless
 * @param {string} options.userAgent - User agent string
 * @param {number} options.debugPort - Debug port for non-headless mode
 * @returns {string[]} Array of Chrome arguments
 */
export function getScraperChromeArgs(options = {}) {
    const { headless = true, userAgent, debugPort, windowWidth, windowHeight } = options;
    const args = [...RESOURCE_CONFIG.chromeFlags.base];

    // Add standard flags
    args.push(...RESOURCE_CONFIG.chromeFlags.standard);

    // Add window size
    const width = windowWidth || RESOURCE_CONFIG.display.viewportWidth;
    const height = windowHeight || RESOURCE_CONFIG.display.viewportHeight;
    args.push(`--window-size=${width},${height}`);

    // Add user agent if provided
    if (userAgent) {
        args.push(`--user-agent=${userAgent}`);
    }

    // Add low resource flags if in low/ultra-low mode
    if (isLowResourceMode()) {
        // Add heap limit flag
        args.push(`--js-flags=--max-old-space-size=${RESOURCE_CONFIG.memory.chromeHeapMB}`);
        // Add other low resource flags
        args.push(...RESOURCE_CONFIG.chromeFlags.lowResource);
    }

    // Add ultra-low resource flags if in ultra-low mode
    if (isUltraLowResourceMode()) {
        args.push(...RESOURCE_CONFIG.chromeFlags.ultraLowResource);
    }

    // Add headless or debug flags
    if (headless) {
        args.push('--headless=new');
    } else if (debugPort) {
        args.push(`--remote-debugging-port=${debugPort}`);
        args.push('--remote-debugging-address=127.0.0.1');
    }

    return args;
}

/**
 * Get Chrome arguments for WhatsApp
 * @returns {string[]} Array of Chrome arguments
 */
export function getWhatsappChromeArgs() {
    const args = [...RESOURCE_CONFIG.chromeFlags.whatsapp];

    // Add heap limit
    args.push(`--js-flags=--max-old-space-size=${RESOURCE_CONFIG.memory.whatsappHeapMB}`);

    return args;
}

/**
 * Get database pool configuration
 * @returns {Object} Database pool configuration
 */
export function getDatabaseConfig() {
    return {
        max: RESOURCE_CONFIG.database.poolSize,
        idleTimeoutMillis: RESOURCE_CONFIG.database.idleTimeoutMs,
        connectionTimeoutMillis: RESOURCE_CONFIG.database.connectionTimeoutMs,
    };
}

// Log configuration on module load (useful for debugging)
if (process.env.NODE_ENV !== 'test') {
    logger.info(`[RESOURCE_CONFIG] Mode: ${RESOURCE_CONFIG.mode}`);
    logger.info(`[RESOURCE_CONFIG] DB Pool: ${RESOURCE_CONFIG.database.poolSize}, Cache: ${RESOURCE_CONFIG.cache.categoryCacheLimit}/${RESOURCE_CONFIG.cache.historyCacheLimit}`);
}

export default RESOURCE_CONFIG;
