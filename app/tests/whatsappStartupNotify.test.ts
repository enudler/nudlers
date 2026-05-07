import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyAppStartedWithLockedVault } from '../utils/whatsappStartupNotify.js';

vi.mock('../utils/logger.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

interface MessagingSettingsOverride {
    whatsapp_enabled?: boolean;
    whatsapp_to?: string;
    whatsapp_notify_on_restart?: boolean;
    telegram_enabled?: boolean;
    telegram_bot_token?: string;
    telegram_to?: string;
    telegram_notify_on_restart?: boolean;
}

const defaultMessagingSettings: Required<MessagingSettingsOverride> = {
    whatsapp_enabled: false,
    whatsapp_to: '',
    whatsapp_notify_on_restart: false,
    telegram_enabled: false,
    telegram_bot_token: '',
    telegram_to: '',
    telegram_notify_on_restart: false,
};

function makeDeps(opts: {
    vaultInitialized: boolean;
    messaging?: MessagingSettingsOverride;
    sendOutcome?: 'success' | 'fail' | 'partial';
    waitOutcome?: 'ready' | 'fail' | 'pending';
}) {
    const vaultRows = opts.vaultInitialized
        ? [{ key: 'wrapped_master_key', value: JSON.stringify('iv:data:tag') }]
        : [];

    const queryFn = vi.fn().mockResolvedValue({ rows: vaultRows });
    const getDB = vi.fn().mockResolvedValue({
        query: queryFn,
        release: vi.fn(),
    });

    const settings = { ...defaultMessagingSettings, ...(opts.messaging ?? {}) };
    const loadMessagingSettings = vi.fn().mockResolvedValue(settings);

    let waitForWhatsappReady: ReturnType<typeof vi.fn>;
    if (opts.waitOutcome === 'fail') {
        waitForWhatsappReady = vi.fn().mockRejectedValue(new Error('not ready in time'));
    } else if (opts.waitOutcome === 'pending') {
        // Caller controls resolution.
        let resolveFn: () => void = () => { };
        let rejectFn: (e: Error) => void = () => { };
        const pending = new Promise<void>((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
        });
        waitForWhatsappReady = vi.fn(() => pending);
        // Stash for tests
        (waitForWhatsappReady as unknown as { _resolve: () => void; _reject: (e: Error) => void })._resolve = resolveFn;
        (waitForWhatsappReady as unknown as { _resolve: () => void; _reject: (e: Error) => void })._reject = rejectFn;
    } else {
        waitForWhatsappReady = vi.fn().mockResolvedValue(undefined);
    }

    const succeeded =
        opts.sendOutcome === 'fail' ? 0 :
            opts.sendOutcome === 'partial' ? 1 : 2;
    const sendNotification = vi.fn().mockResolvedValue({
        success: succeeded > 0,
        attempted: 2,
        succeeded,
        results: [],
    });

    return { getDB, queryFn, settings, loadMessagingSettings, sendNotification, waitForWhatsappReady };
}

describe('notifyAppStartedWithLockedVault', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does NOT send when the vault is uninitialized (no wrapped key)', async () => {
        const deps = makeDeps({
            vaultInitialized: false,
            messaging: { whatsapp_notify_on_restart: true, whatsapp_to: '972501234567' },
        });

        const result = await notifyAppStartedWithLockedVault(deps);

        expect(result.sent).toBe(false);
        expect(result.reason).toBe('not_initialized');
        expect(deps.sendNotification).not.toHaveBeenCalled();
    });

    it('does NOT send when neither channel is opted-in for restart notifications', async () => {
        const deps = makeDeps({
            vaultInitialized: true,
            messaging: {
                whatsapp_notify_on_restart: false,
                whatsapp_to: '972501234567',
                telegram_notify_on_restart: false,
            },
        });

        const result = await notifyAppStartedWithLockedVault(deps);

        expect(result.sent).toBe(false);
        expect(result.reason).toBe('disabled');
        expect(deps.sendNotification).not.toHaveBeenCalled();
    });

    it('does NOT send when the WA toggle is on but recipients are empty', async () => {
        const deps = makeDeps({
            vaultInitialized: true,
            messaging: { whatsapp_notify_on_restart: true, whatsapp_to: '' },
        });

        const result = await notifyAppStartedWithLockedVault(deps);

        expect(result.sent).toBe(false);
        // No usable channel — same as disabled from the dispatcher's perspective.
        expect(result.reason).toBe('disabled');
        expect(deps.sendNotification).not.toHaveBeenCalled();
    });

    it('sends through the dispatcher when WA is configured + opted-in', async () => {
        const deps = makeDeps({
            vaultInitialized: true,
            messaging: { whatsapp_notify_on_restart: true, whatsapp_to: '972501234567' },
        });

        const result = await notifyAppStartedWithLockedVault({
            ...deps,
            now: new Date('2026-04-15T10:00:00Z'),
        });

        expect(result.sent).toBe(true);
        expect(deps.waitForWhatsappReady).toHaveBeenCalledTimes(1);
        expect(deps.sendNotification).toHaveBeenCalledTimes(1);
        const call = deps.sendNotification.mock.calls[0][0];
        expect(call.purpose).toBe('restart_notify');
        // Message reflects the corrected semantics — restart with locked vault,
        // not "vault unlocked".
        expect(call.body).toContain('הופעלה מחדש');
        expect(call.body).toContain('הכספת נעולה');
        expect(call.body).not.toContain('נפתחה'); // would imply "was unlocked"
    });

    it('sends through the dispatcher for Telegram-only setups (no WA wait)', async () => {
        // Vault is initialized, only Telegram is opted in; WA wait must not be
        // called at all because nothing is waiting on WhatsApp.
        const deps = makeDeps({
            vaultInitialized: true,
            messaging: {
                telegram_enabled: true,
                telegram_notify_on_restart: true,
                telegram_to: '12345',
                telegram_bot_token: 'tok',
            },
        });

        const result = await notifyAppStartedWithLockedVault(deps);

        expect(result.sent).toBe(true);
        expect(deps.waitForWhatsappReady).not.toHaveBeenCalled();
        expect(deps.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('still tries Telegram if WhatsApp wait fails (and TG is opted in)', async () => {
        const deps = makeDeps({
            vaultInitialized: true,
            waitOutcome: 'fail',
            messaging: {
                whatsapp_notify_on_restart: true,
                whatsapp_to: '972501234567',
                telegram_enabled: true,
                telegram_notify_on_restart: true,
                telegram_to: '12345',
                telegram_bot_token: 'tok',
            },
        });

        const result = await notifyAppStartedWithLockedVault(deps);

        // Telegram still went out via the dispatcher.
        expect(result.sent).toBe(true);
        expect(deps.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('drops the notification cleanly if WhatsApp wait fails and TG is not configured', async () => {
        const deps = makeDeps({
            vaultInitialized: true,
            waitOutcome: 'fail',
            messaging: { whatsapp_notify_on_restart: true, whatsapp_to: '972501234567' },
        });

        const result = await notifyAppStartedWithLockedVault(deps);

        expect(result.sent).toBe(false);
        expect(result.reason).toBe('whatsapp_not_ready');
        expect(deps.sendNotification).not.toHaveBeenCalled();
    });

    it('treats wrapped_master_key set to JSON empty-string as uninitialized', async () => {
        const queryFn = vi.fn().mockResolvedValue({
            rows: [{ key: 'wrapped_master_key', value: JSON.stringify('') }],
        });
        const getDB = vi.fn().mockResolvedValue({ query: queryFn, release: vi.fn() });
        const loadMessagingSettings = vi.fn().mockResolvedValue({
            ...defaultMessagingSettings,
            whatsapp_notify_on_restart: true,
            whatsapp_to: '972501234567',
        });
        const sendNotification = vi.fn();
        const waitForWhatsappReady = vi.fn();

        const result = await notifyAppStartedWithLockedVault({
            getDB,
            loadMessagingSettings,
            sendNotification,
            waitForWhatsappReady,
        });
        expect(result.reason).toBe('not_initialized');
        expect(sendNotification).not.toHaveBeenCalled();
        expect(waitForWhatsappReady).not.toHaveBeenCalled();
    });
});
