import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import logger from '../utils/logger.js';
import { getWhatsappChromeArgs } from '../config/resource-config.js';
import path from 'path';
import fs from 'fs';

/**
 * WhatsApp Client Singleton
 * Manages a single instance of whatsapp-web.js client.
 * Uses global scoped variables to persist across HMR in development.
 * 
 * Session Persistence:
 * - Sessions are stored in .wwebjs_auth/session-{clientId}
 * - On module load, if a valid session exists, the client auto-initializes
 * - This allows session restoration after server restarts without re-scanning QR
 */

const globalAny = global;

// Use absolute path for auth strategy to ensure persistence in Docker volumes
const AUTH_PATH = path.resolve(process.cwd(), '.wwebjs_auth');
const CLIENT_ID = 'nudlers-client';
const SESSION_PATH = path.join(AUTH_PATH, `session-${CLIENT_ID}`);

// Internal state
let clientInstance = globalAny.whatsappClient || null;
let connectionStatus = globalAny.whatsappStatus || 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, AUTHENTICATED, READY
let qrCode = globalAny.whatsappQR || null;

/**
 * Check if a persisted session exists on disk.
 * A valid session typically has a Default folder with session data.
 */
export function hasPersistedSession() {
    try {
        const defaultPath = path.join(SESSION_PATH, 'Default');
        const localStatePath = path.join(SESSION_PATH, 'Local State');

        // Check for key session files that indicate a valid authenticated session
        const hasDefaultFolder = fs.existsSync(defaultPath);
        const hasLocalState = fs.existsSync(localStatePath);

        if (hasDefaultFolder && hasLocalState) {
            logger.info({ sessionPath: SESSION_PATH }, 'Found persisted WhatsApp session');
            return true;
        }
        return false;
    } catch (err) {
        logger.warn({ err: err.message }, 'Error checking for persisted session');
        return false;
    }
}

/**
 * Get the existing client instance WITHOUT creating a new one.
 * Returns null if no client exists.
 * Use getOrCreateClient() when you need to ensure a client exists.
 */
export function getClient() {
    return clientInstance || globalAny.whatsappClient || null;
}

/**
 * Get or create a client instance. Use this when you need to send messages
 * and want to ensure the client is available.
 */
export function getOrCreateClient() {
    const existing = getClient();
    if (existing) return existing;

    // Auto-initialize for sending if no client exists
    return initializeClient();
}

/**
 * Initialize the WhatsApp client on-demand.
 * This creates a new client and starts the authentication process.
 * If a persisted session exists, it will be restored automatically.
 * Call this when user explicitly requests to connect/generate QR.
 */
export function initializeClient() {
    // Return existing client if already initialized
    if (clientInstance) {
        logger.info('WhatsApp client already exists, returning existing instance');
        return clientInstance;
    }

    const hasSession = hasPersistedSession();
    logger.info({ hasPersistedSession: hasSession }, 'Initializing new WhatsApp Client instance...');

    // Build browser args from centralized resource config
    // NOTE: --single-process is NOT used here as it causes "detached Frame" errors with WhatsApp Web's iframes
    const browserArgs = getWhatsappChromeArgs();

    clientInstance = new Client({
        authStrategy: new LocalAuth({
            clientId: CLIENT_ID,
            dataPath: AUTH_PATH
        }),
        puppeteer: {
            headless: true,
            // Use system chromium if available (Crucial for Docker)
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: browserArgs,
            pipe: true
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
                    const lockPath = path.join(SESSION_PATH, 'SingletonLock');
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
                // Reset client so it can be re-tried manually later
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
    return initializeClient();
}

/**
 * Clear the persisted WhatsApp session from disk.
 * This removes the stored authentication data, requiring a fresh QR scan.
 * Useful when:
 * - WhatsApp session expires or becomes invalid
 * - User wants to link a different WhatsApp account
 * - Troubleshooting authentication issues
 */
export function clearSession() {
    try {
        if (fs.existsSync(SESSION_PATH)) {
            logger.info({ sessionPath: SESSION_PATH }, 'Clearing persisted WhatsApp session...');
            fs.rmSync(SESSION_PATH, { recursive: true, force: true });
            logger.info('WhatsApp session cleared successfully');
            return true;
        }
        logger.info('No persisted session to clear');
        return true;
    } catch (err) {
        logger.error({ err: err.message, sessionPath: SESSION_PATH }, 'Failed to clear WhatsApp session');
        return false;
    }
}

/**
 * Renew the QR code by destroying the client, clearing the session, and reinitializing.
 * This forces a fresh QR code to be generated, useful when:
 * - The current session has expired
 * - The user wants to link a different WhatsApp account
 * - The session state is corrupted
 */
export async function renewQrCode() {
    logger.info('Renewing WhatsApp QR code...');

    // First destroy the existing client
    await destroyClient();

    // Clear the persisted session
    const cleared = clearSession();
    if (!cleared) {
        logger.warn('Failed to clear session, but continuing with QR renewal');
    }

    // Wait a bit to ensure everything is cleaned up
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Initialize fresh client - this will generate a new QR code
    return initializeClient();
}

/**
 * Auto-restore session on module load.
 * If a persisted session exists and no client is currently running,
 * automatically initialize the client to restore the session.
 * This ensures WhatsApp stays connected across server restarts.
 */
function autoRestoreSession() {
    // Skip if client already exists (HMR case)
    if (getClient()) {
        logger.info('WhatsApp client already exists, skipping auto-restore');
        return;
    }

    // Skip if already marked as initialized in global state
    if (globalAny.whatsappAutoRestoreAttempted) {
        return;
    }
    globalAny.whatsappAutoRestoreAttempted = true;

    // Check if we have a persisted session to restore
    if (hasPersistedSession()) {
        logger.info('Auto-restoring WhatsApp session from persisted data...');
        initializeClient();
    } else {
        logger.info('No persisted WhatsApp session found, client will initialize on-demand');
    }
}

// Execute auto-restore on module load
autoRestoreSession();
