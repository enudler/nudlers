import logger from './logger.js';

/**
 * WhatsApp transport router. Picks one implementation per process based on
 * the `whatsapp_transport` setting and proxies the rest of the codebase to
 * it through a stable API.
 *
 * Two transports:
 *   'web'     → whatsapp-web.js (Puppeteer/Chromium, legacy)
 *   'baileys' → @whiskeysockets/baileys (direct WebSocket, recommended)
 *
 * The transport choice is *cached for the life of the process*. Switching
 * transports at runtime is a settings save → restart-the-client operation,
 * not a hot-swap, because each implementation owns its own auth state and
 * its own auto-restore-on-import side effect. We don't want both modules
 * loaded simultaneously fighting for the same singleton.
 *
 * Safe defaults: if reading the setting fails (DB down at boot, etc.) we
 * fall back to 'web' rather than crashing. The legacy client is what
 * existing installs are running, so a fallback to it preserves behaviour.
 */

const FALLBACK_TRANSPORT = 'web';

let cachedTransport = null;     // 'web' | 'baileys'
let cachedModule = null;        // resolved transport module
let resolveOnce = null;         // shared in-flight Promise so concurrent callers don't race

async function readTransportSetting() {
    try {
        const { getDB } = await import('../pages/api/db.js');
        const client = await getDB();
        try {
            const result = await client.query(
                "SELECT value FROM app_settings WHERE key = 'whatsapp_transport'"
            );
            const raw = result.rows[0]?.value;
            if (raw === undefined || raw === null) return FALLBACK_TRANSPORT;
            // jsonb returns parsed values from pg already. Strings come back
            // as strings (because they were JSON.stringified to '"web"' on
            // write); strip surrounding quotes if present.
            let v = raw;
            if (typeof v === 'string') {
                try { v = JSON.parse(v); } catch { /* fall through */ }
            }
            const normalised = String(v || '').toLowerCase().trim();
            if (normalised === 'baileys' || normalised === 'web') return normalised;
            logger.warn({ raw }, '[whatsapp-transport] Unknown transport value, falling back');
            return FALLBACK_TRANSPORT;
        } finally {
            try { client.release(); } catch { /* ignore */ }
        }
    } catch (err) {
        logger.warn({ err: err.message }, '[whatsapp-transport] Failed to read setting, falling back to web');
        return FALLBACK_TRANSPORT;
    }
}

/**
 * Resolve the transport module. Memoized; safe to call concurrently —
 * we keep a single in-flight Promise so we never load both modules.
 */
function ensureTransport() {
    if (cachedModule) return Promise.resolve(cachedModule);
    if (resolveOnce) return resolveOnce;
    resolveOnce = (async () => {
        const transport = await readTransportSetting();
        cachedTransport = transport;
        logger.info({ transport }, '[whatsapp-transport] Loading transport module');
        const mod = transport === 'baileys'
            ? await import('./whatsapp-client-baileys.js')
            : await import('./whatsapp-client.js');
        cachedModule = mod;
        return mod;
    })();
    return resolveOnce;
}

// Kick off resolution as soon as this module loads. Importers don't have to
// await anything for the chosen transport's auto-restore side effects to
// fire — they happen the moment we dynamic-import the module.
ensureTransport().catch((err) => {
    logger.error({ err: err.message }, '[whatsapp-transport] Initial resolve failed');
});

/**
 * Sync API — returns safe defaults until the transport is resolved.
 * Production code that depends on these (status polling, etc.) tolerates
 * a brief 'DISCONNECTED' window during the first ~50ms after boot.
 */
export function getStatus() {
    if (!cachedModule) {
        return { status: 'DISCONNECTED', qr: null, timestamp: new Date().toISOString() };
    }
    return cachedModule.getStatus();
}

export function getClient() {
    if (!cachedModule) return null;
    return cachedModule.getClient();
}

export function hasPersistedSession() {
    if (!cachedModule) return false;
    return cachedModule.hasPersistedSession();
}

export function getActiveTransport() {
    return cachedTransport;
}

/**
 * Async API — awaits the transport module, then delegates. Anything that
 * actually does work (initialize, send-prep, restart) goes through here.
 */
export async function initializeClient() {
    const m = await ensureTransport();
    return m.initializeClient();
}

export async function getOrCreateClient() {
    const m = await ensureTransport();
    return m.getOrCreateClient();
}

export async function destroyClient() {
    const m = await ensureTransport();
    return m.destroyClient();
}

export async function restartClient() {
    const m = await ensureTransport();
    return m.restartClient();
}

export async function clearSession() {
    const m = await ensureTransport();
    return m.clearSession();
}

export async function renewQrCode() {
    const m = await ensureTransport();
    return m.renewQrCode();
}

export async function ensureConnected(opts) {
    const m = await ensureTransport();
    return m.ensureConnected(opts);
}

export async function waitForReady(opts) {
    const m = await ensureTransport();
    return m.waitForReady(opts);
}

export async function sendText(args) {
    const m = await ensureTransport();
    return m.sendText(args);
}

/**
 * Force the router to re-read the transport setting and swap implementation.
 * Used by /api/whatsapp/transport when the user changes the setting in the
 * UI. Tears down the current transport's client first so we don't leak a
 * Chromium/socket that nothing else owns anymore.
 *
 * Note: switching transports throws away the current session (each transport
 * has its own auth dir; we deliberately don't migrate). The caller is
 * responsible for prompting the user to scan a fresh QR.
 */
export async function reloadTransport() {
    if (cachedModule) {
        try {
            await cachedModule.destroyClient();
        } catch (err) {
            logger.warn({ err: err.message }, '[whatsapp-transport] destroy on reload failed');
        }
    }
    cachedModule = null;
    cachedTransport = null;
    resolveOnce = null;
    return ensureTransport();
}
