import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import logger from '../utils/logger.js';
import { getWhatsappChromeArgs } from '../config/resource-config.js';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

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
let isInitializing = false;
let isRenewing = false;

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
    // Return existing client if already initialized or initializing
    if (clientInstance) {
        logger.info('WhatsApp client already exists, returning existing instance');
        return clientInstance;
    }

    if (isInitializing) {
        logger.info('WhatsApp client is already initializing, skipping');
        return null;
    }

    isInitializing = true;

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
        if (!clientInstance) {
            logger.warn('WhatsApp client instance was cleared before initialization could complete');
            isInitializing = false;
            return;
        }
        try {
            await clientInstance.initialize();
            isInitializing = false;
            logger.info('WhatsApp client initialized successfully');
        } catch (err) {
            initRetries++;
            logger.error({ err: err.message, retry: initRetries }, 'Failed to initialize WhatsApp client');

            // Specialized recovery for Puppeteer SingletonLock
            if (err.message && (
                err.message.includes('SingletonLock') ||
                err.message.includes('profile appears to be in use') ||
                err.message.includes('browser is already running')
            )) {
                logger.warn({ err: err.message }, 'Detected profile lock error, attempting automatic cleanup...');
                try {
                    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'];
                    let removedAny = false;

                    for (const fileName of lockFiles) {
                        const filePath = path.join(SESSION_PATH, fileName);
                        try {
                            // Check for both file existence and symlink existence (common on macOS/Linux)
                            const exists = fs.existsSync(filePath);
                            let isSymlink = false;
                            try { isSymlink = fs.lstatSync(filePath).isSymbolicLink(); } catch (e) { }

                            if (exists || isSymlink) {
                                fs.unlinkSync(filePath);
                                logger.info({ fileName }, 'Removed stale Chromium lock file');
                                removedAny = true;
                            }
                        } catch (e) {
                            // Ignore errors for individual files
                        }
                    }

                    if (removedAny) {
                        logger.info('Stale lock files cleared, retrying WhatsApp initialization...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return initializeWithRetry();
                    } else {
                        logger.warn('No stale lock files found to clear, despite lock error');
                    }
                } catch (retryErr) {
                    logger.error({ err: retryErr.message }, 'Failed to recover from profile lock error');
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
                isInitializing = false;
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
            // Add a timeout to prevent hanging if client.destroy() gets stuck
            await Promise.race([
                client.destroy(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Destroy timed out')), 5000))
            ]);
        } catch (e) {
            logger.error({ err: e.message }, 'Error destroying WhatsApp client');
        }
    }

    // Reset all local and global states
    clientInstance = null;
    qrCode = null;
    connectionStatus = 'DISCONNECTED';

    globalAny.whatsappClient = null;
    globalAny.whatsappQR = null;
    globalAny.whatsappStatus = 'DISCONNECTED';

    // Aggressively kill any remaining chrome processes associated with this session
    killStrayProcesses();
}

/**
 * Find and kill any orphan Chromium processes holding the session lock.
 * This is a failsafe for when puppetter/whatsapp-web.js fails to close the browser.
 */
function killStrayProcesses() {
    try {
        const platform = process.platform;
        logger.info({ platform }, 'Checking for stale WhatsApp Chromium processes...');

        if (platform === 'darwin' || platform === 'linux') {
            // Find PIDs of processes using our session directory
            // We use a broader pattern to include helpers and renderers
            const cmd = `ps aux | grep "session-${CLIENT_ID}" | grep -v grep | awk '{print $2}'`;
            const output = execSync(cmd).toString().trim();

            if (output) {
                const pids = output.split('\n').filter(Boolean);
                logger.warn({ pids }, 'Found orphan WhatsApp processes, killing...');
                for (const pid of pids) {
                    try {
                        process.kill(parseInt(pid, 10), 'SIGKILL');
                    } catch (e) {
                        // Ignore if process already gone
                    }
                }
            } else {
                logger.info('No stale WhatsApp processes found');
            }
        }
    } catch (err) {
        logger.error({ err: err.message }, 'Failed to kill stray WhatsApp processes');
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
    if (isRenewing) {
        logger.info('WhatsApp QR code renewal already in progress, skipping');
        return getClient();
    }

    logger.info('Renewing WhatsApp QR code...');
    isRenewing = true;

    try {
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
    } finally {
        isRenewing = false;
    }
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
