
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs';

// Singleton instance
let clientInstance = null;
let qrCode = null;
let connectionStatus = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, AUTHENTICATED, READY

// We need to attach this to global in development to prevent re-initialization on hot-reload
// but in production it's just a module level variable
const globalAny = global;

if (globalAny.whatsappClient) {
    clientInstance = globalAny.whatsappClient;
    connectionStatus = globalAny.whatsappStatus || 'DISCONNECTED';
    qrCode = globalAny.whatsappQR || null;
}

export function getClient() {
    if (!clientInstance) {
        logger.info('Initializing new WhatsApp Client instance...');

        // Ensure absolute path for auth strategy
        const authPath = path.resolve(process.cwd(), '.wwebjs_auth');

        clientInstance = new Client({
            authStrategy: new LocalAuth({
                clientId: 'nudlers-client',
                dataPath: authPath
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        // Event listeners
        clientInstance.on('qr', (qr) => {
            logger.info('WhatsApp QR Code generated');
            qrCode = qr;
            connectionStatus = 'QR_READY';

            // Update global state
            globalAny.whatsappQR = qr;
            globalAny.whatsappStatus = 'QR_READY';
        });

        clientInstance.on('ready', () => {
            logger.info('WhatsApp Client is ready!');
            connectionStatus = 'READY';
            qrCode = null;

            // Update global state
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

        clientInstance.on('disconnected', (reason) => {
            logger.warn({ reason }, 'WhatsApp Client disconnected');
            connectionStatus = 'DISCONNECTED';
            qrCode = null;

            // Update global state
            globalAny.whatsappQR = null;
            globalAny.whatsappStatus = 'DISCONNECTED';

            // Try to re-initialize?
            destroyClient().then(() => {
                // Maybe auto-restart logic here if needed
            });
        });

        // Save to global
        globalAny.whatsappClient = clientInstance;

        // Start initialization
        connectionStatus = 'INITIALIZING';
        globalAny.whatsappStatus = 'INITIALIZING';

        clientInstance.initialize().catch(async err => {
            logger.error({ err }, 'Failed to initialize WhatsApp client');
            connectionStatus = 'DISCONNECTED';
            globalAny.whatsappStatus = 'DISCONNECTED';

            // Auto-recovery for SingletonLock
            if (err.message && err.message.includes('SingletonLock')) {
                logger.warn('Detected SingletonLock error, attempting to clean up and retry...');
                try {
                    const lockPath = path.join(authPath, 'session-nudlers-client', 'SingletonLock');
                    if (fs.existsSync(lockPath)) {
                        fs.unlinkSync(lockPath);
                        logger.info('Removed SingletonLock file');
                        // wait a bit and retry (simple retry, not recursive to avoid loops)
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await clientInstance.initialize();
                        logger.info('Retry initialization successful');
                    }
                } catch (retryErr) {
                    logger.error({ err: retryErr }, 'Failed to recover from SingletonLock error');
                }
            }
        });
    }

    return clientInstance;
}

export function getStatus() {
    return {
        status: globalAny.whatsappStatus || connectionStatus,
        qr: globalAny.whatsappQR || qrCode
    };
}

export async function destroyClient() {
    if (clientInstance) {
        try {
            await clientInstance.destroy();
        } catch (e) {
            logger.error({ err: e }, 'Error destroying client');
        }
        clientInstance = null;
        qrCode = null;
        connectionStatus = 'DISCONNECTED';

        globalAny.whatsappClient = null;
        globalAny.whatsappQR = null;
        globalAny.whatsappStatus = 'DISCONNECTED';
    }
}

export async function restartClient() {
    await destroyClient();
    return getClient();
}

// Ensure client is initialized or retrieved
// getClient(); // Don't auto-init on require, let instrumentation do it
