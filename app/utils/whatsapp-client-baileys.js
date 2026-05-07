import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import logger from './logger.js';

/**
 * Baileys-based WhatsApp client. Same public API as ./whatsapp-client.js
 * (the legacy whatsapp-web.js implementation), so the transport router can
 * pick one without anything else in the codebase caring.
 *
 * Why Baileys: it speaks WhatsApp's Multi-Device protocol over a WebSocket
 * directly. No Chromium, no Puppeteer, no SingletonLock files. ~30 MB RSS
 * vs 250-400 MB for whatsapp-web.js. Sub-second cold start vs 30-90s.
 *
 * Auth state lives at .baileys_auth/ (deliberately separate from .wwebjs_auth/
 * so the two transports can coexist and you can flip between them via the
 * settings UI without nuking each other's session).
 */

const AUTH_PATH = path.resolve(process.cwd(), '.baileys_auth');
const READY_TIMEOUT_MS = 60_000;
const RECONNECT_BACKOFF_MS = 2_000;

// All process-wide state lives on globalThis so HMR in next dev doesn't make
// a second client. Mirrors how whatsapp-client.js does it.
const globalAny = global;

function getState() {
    return {
        sock: globalAny.baileysSock || null,
        status: globalAny.baileysStatus || 'DISCONNECTED', // DISCONNECTED, INITIALIZING, QR_READY, AUTHENTICATED, READY
        qr: globalAny.baileysQr || null,
        saveCreds: globalAny.baileysSaveCreds || null,
        emitter: globalAny.baileysEmitter || null,
    };
}

function setStatus(status, extra = {}) {
    globalAny.baileysStatus = status;
    if (Object.prototype.hasOwnProperty.call(extra, 'qr')) {
        globalAny.baileysQr = extra.qr;
    }
    // Surface to anything listening (the startup-notify uses the same global
    // status pattern as the legacy client).
    globalAny.whatsappStatus = status === 'READY' || status === 'AUTHENTICATED' ? status : globalAny.whatsappStatus;
}

/**
 * Tiny pub-sub keyed off node EventEmitter — used by ensureConnected /
 * waitForReady to await transitions on the singleton without keeping
 * baileys-specific listeners around.
 */
function getEmitter() {
    if (globalAny.baileysEmitter) return globalAny.baileysEmitter;
    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);
    globalAny.baileysEmitter = emitter;
    return emitter;
}

export function hasPersistedSession() {
    try {
        const credsPath = path.join(AUTH_PATH, 'creds.json');
        if (!fs.existsSync(credsPath)) return false;
        // Empty creds.json = effectively no session (a logged-out state can
        // leave a zero-byte file behind).
        const stat = fs.statSync(credsPath);
        return stat.size > 0;
    } catch (err) {
        logger.warn({ err: err.message }, '[baileys] hasPersistedSession check failed');
        return false;
    }
}

export function getStatus() {
    const s = getState();
    return {
        status: s.status,
        qr: s.qr,
        timestamp: new Date().toISOString(),
    };
}

export function getClient() {
    return getState().sock;
}

export function getOrCreateClient() {
    const existing = getClient();
    if (existing) return existing;
    return initializeClient();
}

/**
 * Build a fresh socket. Each Baileys socket can only be initialized once;
 * on reconnect we tear the old one down and call this again.
 */
async function buildSock() {
    // Lazy-load Baileys so the transport router can avoid the cost on
    // installs that don't use it.
    const baileys = await import('@whiskeysockets/baileys');
    // Rename `useMultiFileAuthState` so the React-hooks-rules linter doesn't
    // mistake it for a misused React hook (it's a Baileys helper that just
    // happens to follow the `useX` naming convention).
    const { default: makeWASocket, useMultiFileAuthState: createMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = baileys;

    if (!fs.existsSync(AUTH_PATH)) {
        fs.mkdirSync(AUTH_PATH, { recursive: true });
    }

    const { state, saveCreds } = await createMultiFileAuthState(AUTH_PATH);
    globalAny.baileysSaveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        // Baileys requires a Pino-shaped logger (debug/info/warn/error/trace
        // + child()). Our app logger is Pino so it satisfies the contract.
        logger,
        browser: Browsers ? Browsers.appropriate?.('Nudlers') ?? Browsers.macOS?.('Nudlers') ?? ['Nudlers', 'Safari', '1.0'] : ['Nudlers', 'Safari', '1.0'],
        // We send only — never read. Skipping history sync keeps memory
        // small and avoids the "syncing messages..." stall on reconnect.
        syncFullHistory: false,
        markOnlineOnConnect: false,
        // Bigger value than the default 25 keeps long-lived connections
        // from churning while idle.
        keepAliveIntervalMs: 30_000,
    });

    return sock;
}

/**
 * Wire connection.update / creds.update handlers and emit our own
 * unified status events on the local emitter so callers (ensureConnected,
 * waitForReady) can await transitions without depending on Baileys.
 */
function wireSockEvents(sock) {
    const emitter = getEmitter();

    sock.ev.on('creds.update', async () => {
        const s = getState();
        if (s.saveCreds) {
            try { await s.saveCreds(); } catch (err) {
                logger.warn({ err: err.message }, '[baileys] saveCreds failed');
            }
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info('[baileys] QR code generated');
            setStatus('QR_READY', { qr });
            emitter.emit('qr', qr);
        }

        if (connection === 'open') {
            logger.info('[baileys] Connection ready');
            setStatus('READY', { qr: null });
            // Mirror the legacy global so whatsappStartupNotify's
            // waitForWhatsAppReady() short-circuits cleanly.
            globalAny.whatsappStatus = 'READY';
            emitter.emit('ready');
        }

        if (connection === 'connecting') {
            // Don't downgrade an already-READY status to INITIALIZING just
            // because Baileys ticked through 'connecting' during a routine
            // network blip.
            if (getState().status !== 'READY' && getState().status !== 'AUTHENTICATED') {
                setStatus('INITIALIZING');
            }
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
                ?? lastDisconnect?.error?.output?.payload?.statusCode;
            // 401 = DisconnectReason.loggedOut — the only code where a
            // reconnect can't help; user must scan a fresh QR. Hardcoded
            // because doing `await import('@whiskeysockets/baileys')` here
            // would defer the rest of this handler past the reconnect
            // window for callers using fake timers.
            const loggedOut = code === 401;
            const reason = lastDisconnect?.error?.message || 'unknown';

            logger.warn({ code, reason, loggedOut }, '[baileys] Connection closed');
            globalAny.whatsappStatus = 'DISCONNECTED';
            setStatus('DISCONNECTED', { qr: null });
            emitter.emit('disconnected', { code, reason, loggedOut });

            // On loggedOut, the saved session is dead — only a fresh QR scan
            // helps. Don't auto-reconnect (we'd just spin up another socket
            // and immediately get kicked again).
            if (loggedOut) {
                logger.warn('[baileys] Session is logged out — clearing creds, fresh QR required');
                try { fs.rmSync(AUTH_PATH, { recursive: true, force: true }); } catch { /* swallow */ }
                globalAny.baileysSock = null;
                return;
            }

            // Anything else: drop the dead socket and rebuild after a small
            // backoff. Baileys does NOT auto-reconnect for you.
            globalAny.baileysSock = null;
            setTimeout(() => {
                initializeClient().catch((err) => {
                    logger.error({ err: err.message }, '[baileys] auto-reconnect failed');
                });
            }, RECONNECT_BACKOFF_MS);
        }
    });

    // Our public API exposes off()/once() in waitForReady semantics; bridge
    // those through the emitter rather than Baileys's sock.ev to keep them
    // under our control.
    return {
        once: (evt, cb) => emitter.once(evt, cb),
        off: (evt, cb) => emitter.off(evt, cb),
        on: (evt, cb) => emitter.on(evt, cb),
    };
}

export async function initializeClient() {
    const existing = getState().sock;
    if (existing) {
        logger.info('[baileys] Client already exists, returning existing instance');
        return existing;
    }

    const hasSession = hasPersistedSession();
    logger.info({ hasPersistedSession: hasSession }, '[baileys] Initializing new client');

    setStatus('INITIALIZING');
    globalAny.whatsappStatus = 'INITIALIZING';

    try {
        const sock = await buildSock();
        wireSockEvents(sock);
        globalAny.baileysSock = sock;
        return sock;
    } catch (err) {
        logger.error({ err: err.message, stack: err.stack }, '[baileys] Initialization failed');
        setStatus('DISCONNECTED', { qr: null });
        globalAny.whatsappStatus = 'DISCONNECTED';
        globalAny.baileysSock = null;
        throw err;
    }
}

export async function destroyClient() {
    const sock = getState().sock;
    if (!sock) return;
    try {
        // logout() actually logs the session out of WhatsApp servers — we
        // don't want that, just the local close. end() with no args is the
        // safe shutdown that preserves auth state.
        if (typeof sock.end === 'function') {
            sock.end(undefined);
        } else if (typeof sock.ws?.close === 'function') {
            sock.ws.close();
        }
    } catch (err) {
        logger.warn({ err: err.message }, '[baileys] error tearing down socket');
    }
    globalAny.baileysSock = null;
    setStatus('DISCONNECTED', { qr: null });
    globalAny.whatsappStatus = 'DISCONNECTED';
}

export async function restartClient() {
    logger.info('[baileys] Restarting client');
    await destroyClient();
    // Brief pause so the underlying socket really finishes closing before
    // we open the next one and trip into the same connection slot.
    await new Promise((r) => setTimeout(r, 1000));
    return initializeClient();
}

export function clearSession() {
    try {
        if (fs.existsSync(AUTH_PATH)) {
            logger.info({ AUTH_PATH }, '[baileys] Clearing persisted session');
            fs.rmSync(AUTH_PATH, { recursive: true, force: true });
            return true;
        }
        return true;
    } catch (err) {
        logger.error({ err: err.message }, '[baileys] Failed to clear session');
        return false;
    }
}

export async function renewQrCode() {
    logger.info('[baileys] Renewing QR code');
    await destroyClient();
    clearSession();
    await new Promise((r) => setTimeout(r, 500));
    return initializeClient();
}

/**
 * Wait for the socket to reach READY. Mirrors the contract on the legacy
 * client: resolve on ready, reject on auth_failure or timeout.
 *
 * Also exported below as `waitForReady` so the transport router can proxy
 * a uniform "wait for the active transport to be ready" call regardless of
 * which implementation is loaded.
 */
function waitForReadyInternal(timeoutMs) {
    return new Promise((resolve, reject) => {
        const emitter = getEmitter();

        // Already ready? Short-circuit.
        if (getState().status === 'READY' || getState().status === 'AUTHENTICATED') {
            return resolve();
        }

        const cleanup = () => {
            clearTimeout(timer);
            emitter.off('ready', onReady);
            emitter.off('disconnected', onDisconnected);
        };
        const onReady = () => { cleanup(); resolve(); };
        const onDisconnected = ({ loggedOut, reason }) => {
            if (loggedOut) {
                cleanup();
                reject(new Error(`Baileys auth failure (logged out): ${reason}`));
            }
            // Non-fatal disconnects auto-reconnect; keep waiting.
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Baileys client did not become ready within ${timeoutMs}ms`));
        }, timeoutMs);

        emitter.once('ready', onReady);
        emitter.on('disconnected', onDisconnected);
    });
}

export async function ensureConnected({ timeoutMs = READY_TIMEOUT_MS } = {}) {
    const existing = getClient();
    if (existing && (getState().status === 'READY' || getState().status === 'AUTHENTICATED')) {
        return existing;
    }

    if (!existing) {
        logger.info('[baileys] No socket — initializing before send');
        await initializeClient();
    } else {
        logger.warn({ status: getState().status }, '[baileys] Socket not READY — waiting');
    }

    await waitForReadyInternal(timeoutMs);
    return getClient();
}

export function waitForReady({ timeoutMs = READY_TIMEOUT_MS } = {}) {
    if (!getClient()) {
        // Kick off init in the background so the wait actually has a chance
        // of succeeding. ensureConnected() does the same thing internally.
        initializeClient().catch(() => { /* errors surface via emitter */ });
    }
    return waitForReadyInternal(timeoutMs);
}

/**
 * Transport-uniform send. Baileys takes a JID + a message-content object
 * (`{ text }`) and returns `{ key: { id } }`; we project that into the same
 * `{ id }` shape the legacy client's sendText returns so whatsapp.js doesn't
 * have to care which transport answered.
 */
export async function sendText({ client, chatId, body }) {
    const sent = await client.sendMessage(chatId, { text: body });
    return { id: sent?.key?.id ?? '' };
}

/**
 * Auto-restore on module load — mirrors the legacy client's startup hook.
 * If the transport router lazy-imports this file (it does), the load only
 * happens when transport === 'baileys'.
 */
function autoRestoreSession() {
    if (getClient()) return;
    if (globalAny.baileysAutoRestoreAttempted) return;
    globalAny.baileysAutoRestoreAttempted = true;

    if (hasPersistedSession()) {
        logger.info('[baileys] Auto-restoring session from disk');
        initializeClient().catch((err) => {
            logger.error({ err: err.message }, '[baileys] auto-restore failed');
        });
    } else {
        logger.info('[baileys] No persisted session — will initialize on demand');
    }
}

autoRestoreSession();
