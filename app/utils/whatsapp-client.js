
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs';

/**
 * WhatsApp Client Singleton
 * Manages a single instance of whatsapp-web.js client.
 * Uses global scoped variables to persist across HMR in development.
 */

const globalAny = global;

// Internal state
let clientInstance = globalAny.whatsappClient || null;
let connectionStatus = globalAny.whatsappStatus || 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, AUTHENTICATED, READY
let qrCode = globalAny.whatsappQR || null;

export function getClient() {
    if (clientInstance) return clientInstance;

    logger.info('Initializing new WhatsApp Client instance...');

    // Use absolute path for auth strategy to ensure persistence in Docker volumes
    const authPath = path.resolve(process.cwd(), '.wwebjs_auth');

    // Build browser args - always use low-resource flags for WhatsApp since it runs continuously
    const browserArgs = [
        // Core sandbox/Docker flags
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        // Process optimization (critical for NAS - reduces memory footprint)
        '--single-process',
        '--no-zygote',
        '--no-first-run',
        '--disable-extensions',
        // Memory optimization
        '--js-flags=--max-old-space-size=128', // WhatsApp needs less heap than scraping
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
        '--disable-print-preview',
        '--disable-speech-api',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        // Background throttling
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // Feature disabling
        '--disable-features=TranslateUI,IsolateOrigins,site-per-process,BackForwardCache',
        '--blink-settings=imagesEnabled=false',
    ];

    clientInstance = new Client({
        authStrategy: new LocalAuth({
            clientId: 'nudlers-client',
            dataPath: authPath
        }),
        puppeteer: {
            headless: true,
            // Use system chromium if available (Crucial for Docker)
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: browserArgs
        }
    });

    // Event listeners
    clientInstance.on('qr', (qr) => {
        logger.info('WhatsApp QR Code generated');
        qrCode = qr;
        connectionStatus = 'QR_READY';
        globalAny.whatsappQR = qr;
        globalAny.whatsappStatus = 'QR_READY';
    });

    clientInstance.on('ready', () => {
        logger.info('WhatsApp Client is ready!');
        connectionStatus = 'READY';
        qrCode = null;
        globalAny.whatsappQR = null;
        globalAny.whatsappStatus = 'READY';
    });

    clientInstance.on('authenticated', () => {
        logger.info('WhatsApp Client authenticated');
        connectionStatus = 'AUTHENTICATED';
        globalAny.whatsappStatus = 'AUTHENTICATED';
    });

    clientInstance.on('auth_failure', (msg) => {
        logger.error({ msg }, 'WhatsApp authentication failure');
        connectionStatus = 'DISCONNECTED';
        globalAny.whatsappStatus = 'DISCONNECTED';
    });

    clientInstance.on('disconnected', async (reason) => {
        logger.warn({ reason }, 'WhatsApp Client disconnected');
        connectionStatus = 'DISCONNECTED';
        qrCode = null;
        globalAny.whatsappQR = null;
        globalAny.whatsappStatus = 'DISCONNECTED';

        // Clean up and allow for re-initialization
        await destroyClient();
    });

    // Save to global to survive HMR
    globalAny.whatsappClient = clientInstance;

    // Start initialization
    connectionStatus = 'INITIALIZING';
    globalAny.whatsappStatus = 'INITIALIZING';

    const MAX_INIT_RETRIES = 3;
    let initRetries = 0;

    const initializeWithRetry = async () => {
        try {
            await clientInstance.initialize();
            logger.info('WhatsApp client initialized successfully');
        } catch (err) {
            initRetries++;
            logger.error({ err: err.message, retry: initRetries }, 'Failed to initialize WhatsApp client');

            // Specialized recovery for Puppeteer SingletonLock
            if (err.message && (err.message.includes('SingletonLock') || err.message.includes('profile appears to be in use'))) {
                logger.warn('Detected SingletonLock error, attempting automatic cleanup...');
                try {
                    const lockPath = path.join(authPath, 'session-nudlers-client', 'SingletonLock');
                    if (fs.existsSync(lockPath)) {
                        fs.unlinkSync(lockPath);
                        logger.info('Removed SingletonLock file, retrying...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return initializeWithRetry();
                    }
                } catch (retryErr) {
                    logger.error({ err: retryErr.message }, 'Failed to recover from SingletonLock');
                }
            }

            if (initRetries < MAX_INIT_RETRIES) {
                const delay = Math.pow(2, initRetries) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return initializeWithRetry();
            } else {
                logger.error('Max retries reached for WhatsApp initialization');
                connectionStatus = 'DISCONNECTED';
                globalAny.whatsappStatus = 'DISCONNECTED';
                // Reset client so it can be re-tried manually later via getClient()
                clientInstance = null;
                globalAny.whatsappClient = null;
            }
        }
    };

    initializeWithRetry();

    return clientInstance;
}

export function getStatus() {
    return {
        status: globalAny.whatsappStatus || connectionStatus,
        qr: globalAny.whatsappQR || qrCode,
        timestamp: new Date().toISOString()
    };
}

export async function destroyClient() {
    if (clientInstance || globalAny.whatsappClient) {
        const client = clientInstance || globalAny.whatsappClient;
        try {
            logger.info('Destroying WhatsApp client instance...');
            await client.destroy();
        } catch (e) {
            logger.error({ err: e.message }, 'Error destroying WhatsApp client');
        }

        // Reset all local and global states
        clientInstance = null;
        qrCode = null;
        connectionStatus = 'DISCONNECTED';

        globalAny.whatsappClient = null;
        globalAny.whatsappQR = null;
        globalAny.whatsappStatus = 'DISCONNECTED';
    }
}

export async function restartClient() {
    logger.info('Restarting WhatsApp client...');
    await destroyClient();
    // Wait a bit to ensure resources are freed
    await new Promise(resolve => setTimeout(resolve, 1000));
    return getClient();
}
