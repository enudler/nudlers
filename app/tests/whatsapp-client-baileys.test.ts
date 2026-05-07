import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('../utils/logger.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn() }) },
}));

// Mock fs so the module's autoRestoreSession() can't accidentally find a
// real session on disk and trigger initialization on import.
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        default: {
            ...actual,
            existsSync: vi.fn(() => false),
            statSync: vi.fn(() => ({ size: 0 })),
            mkdirSync: vi.fn(),
            rmSync: vi.fn(),
        },
        existsSync: vi.fn(() => false),
        statSync: vi.fn(() => ({ size: 0 })),
        mkdirSync: vi.fn(),
        rmSync: vi.fn(),
    };
});

interface MockSock {
    ev: EventEmitter;
    sendMessage: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    ws: { close: ReturnType<typeof vi.fn> };
}

let lastMockSock: MockSock | null = null;
let makeWASocketMock: ReturnType<typeof vi.fn>;
let saveCredsMock: ReturnType<typeof vi.fn>;

vi.mock('@whiskeysockets/baileys', () => {
    saveCredsMock = vi.fn().mockResolvedValue(undefined);
    makeWASocketMock = vi.fn(() => {
        const sock: MockSock = {
            ev: new EventEmitter(),
            sendMessage: vi.fn().mockResolvedValue({ key: { id: 'mocked-msg-id' } }),
            end: vi.fn(),
            ws: { close: vi.fn() },
        };
        lastMockSock = sock;
        return sock;
    });
    return {
        default: makeWASocketMock,
        // Some Baileys exports are namespaced; expose the bits the client
        // module reaches for via `await import` destructuring.
        useMultiFileAuthState: vi.fn().mockResolvedValue({
            state: {},
            saveCreds: saveCredsMock,
        }),
        fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 0] }),
        Browsers: {
            macOS: (name: string) => [name, 'Safari', '1.0'],
            appropriate: (name: string) => [name, 'Safari', '1.0'],
        },
        DisconnectReason: {
            loggedOut: 401,
            connectionClosed: 428,
            connectionLost: 408,
            badSession: 500,
            restartRequired: 515,
        },
    };
});

// Reset ALL of the module's globalThis state between tests so each test
// starts from a clean slate. The module memoizes its singleton on global,
// which is fine in production but lethal for test isolation.
function clearBaileysGlobals() {
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.baileysSock;
    delete g.baileysStatus;
    delete g.baileysQr;
    delete g.baileysSaveCreds;
    delete g.baileysEmitter;
    delete g.baileysAutoRestoreAttempted;
    delete g.whatsappStatus;
}

describe('whatsapp-client-baileys', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearBaileysGlobals();
        // Re-import the module fresh each test so autoRestoreSession's
        // module-load side effect runs against the current mock state.
        vi.resetModules();
    });

    afterEach(() => {
        clearBaileysGlobals();
    });

    it('reports DISCONNECTED before any init', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        const status = mod.getStatus();
        expect(status.status).toBe('DISCONNECTED');
        expect(status.qr).toBeNull();
    });

    it('initializes a socket and reports INITIALIZING immediately', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        expect(makeWASocketMock).toHaveBeenCalledTimes(1);
        const status = mod.getStatus();
        // Status is INITIALIZING (or QR_READY if a QR fired synchronously).
        expect(['INITIALIZING', 'QR_READY', 'READY']).toContain(status.status);
    });

    it('transitions to QR_READY when the socket emits a qr update', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        lastMockSock!.ev.emit('connection.update', { qr: 'fake-qr-string' });
        const status = mod.getStatus();
        expect(status.status).toBe('QR_READY');
        expect(status.qr).toBe('fake-qr-string');
    });

    it('transitions to READY when connection.update reports open', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        lastMockSock!.ev.emit('connection.update', { connection: 'open' });
        expect(mod.getStatus().status).toBe('READY');
        expect(mod.getStatus().qr).toBeNull();
    });

    it('saves creds to disk on creds.update', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        lastMockSock!.ev.emit('creds.update');
        // Microtask flush so the async handler runs.
        await new Promise((r) => setImmediate(r));
        expect(saveCredsMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT auto-reconnect on a loggedOut close (clears session instead)', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        expect(makeWASocketMock).toHaveBeenCalledTimes(1);

        lastMockSock!.ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: { output: { statusCode: 401 } } }, // loggedOut
        });

        // Wait long enough that any (errant) auto-reconnect would have fired.
        await new Promise((r) => setTimeout(r, 50));
        // Still only the original socket creation — no reconnect.
        expect(makeWASocketMock).toHaveBeenCalledTimes(1);
        expect(mod.getStatus().status).toBe('DISCONNECTED');
    });

    it('auto-reconnects on a non-loggedOut close after the backoff', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        expect(makeWASocketMock).toHaveBeenCalledTimes(1);

        lastMockSock!.ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: { output: { statusCode: 428 } } }, // connectionClosed
        });

        // Backoff is 2_000ms in the production code path. Wait a bit longer
        // and let the async reconnect (dynamic-import + useMultiFileAuthState
        // + makeWASocket) settle. We use real timers because the reconnect
        // chain awaits multiple promises that don't all surface as fake-timer
        // tasks.
        await new Promise((r) => setTimeout(r, 2_500));

        expect(makeWASocketMock).toHaveBeenCalledTimes(2);
    }, 10_000);

    it('sendText projects Baileys response into a unified { id } shape', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        const result = await mod.sendText({
            client: lastMockSock,
            chatId: '972500000000@c.us',
            body: 'hi',
        });
        expect(result).toEqual({ id: 'mocked-msg-id' });
        expect(lastMockSock!.sendMessage).toHaveBeenCalledWith(
            '972500000000@c.us',
            { text: 'hi' }
        );
    });

    it('destroyClient tears down the socket and clears state', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        // Get to READY first so we have something meaningful to tear down.
        lastMockSock!.ev.emit('connection.update', { connection: 'open' });
        expect(mod.getStatus().status).toBe('READY');

        await mod.destroyClient();
        expect(mod.getStatus().status).toBe('DISCONNECTED');
        expect(mod.getClient()).toBeNull();
        expect(lastMockSock!.end).toHaveBeenCalled();
    });

    it('waitForReady resolves immediately if status is already READY', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();
        lastMockSock!.ev.emit('connection.update', { connection: 'open' });
        await expect(mod.waitForReady({ timeoutMs: 100 })).resolves.toBeUndefined();
    });

    it('waitForReady rejects on auth failure (loggedOut close)', async () => {
        const mod = await import('../utils/whatsapp-client-baileys.js');
        await mod.initializeClient();

        const promise = mod.waitForReady({ timeoutMs: 5000 });
        // Fire the loggedOut close on the next tick so the listener is
        // already attached.
        await new Promise((r) => setImmediate(r));
        lastMockSock!.ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: { output: { statusCode: 401 } } },
        });

        await expect(promise).rejects.toThrow(/logged out/i);
    });
});
