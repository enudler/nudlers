import logger from './logger.js';

/**
 * Send a notification at app startup if the vault is initialized but locked
 * — i.e. "the app just came back online and it's waiting for you to unlock
 * it." This is the only signal you get that something restarted your server
 * (NAS reboot, deploy, OOM) without having to actively check.
 *
 * The vault is *always* locked at startup by design: the master key lives in
 * memory only and is wiped on process exit. So "vault is locked" is a sloppy
 * way of saying "this is a fresh boot." We still gate on `wrapped_master_key`
 * existing so we don't spam users who haven't initialized the vault at all.
 *
 * Fire-and-forget by design — the caller in instrumentation.ts should not
 * await this. A missing client, a stale session, or a network blip must
 * never break startup.
 *
 * Filename is historical: this used to be WhatsApp-only. It now fans out to
 * every enabled provider through the messaging dispatcher.
 */

const READY_TIMEOUT_MS = 90_000;

export async function notifyAppStartedWithLockedVault(opts = {}) {
    const {
        getDB,
        sendNotification,
        waitForWhatsappReady,
        loadMessagingSettings,
        now,
    } = await resolveDependencies(opts);

    let vaultIsInitialized = false;
    const settings = await loadMessagingSettings({ getDB });

    // Vault-init flag isn't part of messaging settings; fetch it separately.
    const dbClient = await getDB();
    try {
        const result = await dbClient.query(
            `SELECT value FROM app_settings WHERE key = 'wrapped_master_key'`
        );
        const row = result.rows[0];
        if (row) {
            let v = row.value;
            try { v = JSON.parse(v); } catch { /* fall through with raw */ }
            vaultIsInitialized = typeof v === 'string' && v.length > 0;
        }
    } finally {
        try { dbClient.release(); } catch { /* ignore */ }
    }

    if (!vaultIsInitialized) {
        logger.info('[startup-notify] Vault not initialized; nothing to unlock — skipping notification');
        return { sent: false, reason: 'not_initialized' };
    }

    const wantsWhatsapp = settings.whatsapp_notify_on_restart && settings.whatsapp_to;
    const wantsTelegram = settings.telegram_notify_on_restart && settings.telegram_enabled && settings.telegram_to;

    if (!wantsWhatsapp && !wantsTelegram) {
        return { sent: false, reason: 'disabled' };
    }

    // If WhatsApp wants the message, wait for the active WA transport
    // (legacy or Baileys) to reach READY before dispatching. Telegram
    // doesn't need this; if WA is the only enabled channel and it never
    // becomes ready, we drop the notification cleanly.
    if (wantsWhatsapp) {
        try {
            await waitForWhatsappReady({ timeoutMs: READY_TIMEOUT_MS });
        } catch (err) {
            logger.warn({ err: err.message }, '[startup-notify] WhatsApp not ready in time — Telegram (if configured) will still try');
            if (!wantsTelegram) {
                return { sent: false, reason: 'whatsapp_not_ready' };
            }
        }
    }

    const when = now ?? new Date();
    const time = when.toLocaleString('he-IL', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const body = `🔒 Nudlers — האפליקציה הופעלה מחדש\nהכספת נעולה ומחכה לפתיחה\n${time}`;

    const dispatch = await sendNotification({
        body,
        purpose: 'restart_notify',
    });

    if (dispatch.succeeded > 0) {
        logger.info({ dispatch }, '[startup-notify] Notification dispatched');
        return { sent: true, reason: 'ok', dispatch };
    }
    logger.warn({ dispatch }, '[startup-notify] Notification dispatch failed on all channels');
    return { sent: false, reason: 'all_channels_failed', dispatch };
}

/**
 * Resolve module dependencies. Production passes nothing and we lazy-import
 * everything to avoid pulling whatsapp-web.js into bundles that don't need
 * it. Tests pass overrides for easy mocking without `vi.mock` gymnastics.
 */
async function resolveDependencies(overrides) {
    if (
        overrides.getDB &&
        overrides.sendNotification &&
        overrides.waitForWhatsappReady &&
        overrides.loadMessagingSettings
    ) {
        return overrides;
    }
    const dbModule = await import('../pages/api/db.js');
    const dispatcherModule = await import('./messaging/dispatcher.js');
    const settingsModule = await import('./messaging/settings.js');
    const transportModule = await import('./whatsapp-transport.js');
    return {
        getDB: overrides.getDB || dbModule.getDB,
        sendNotification: overrides.sendNotification || dispatcherModule.sendNotification,
        loadMessagingSettings: overrides.loadMessagingSettings || settingsModule.loadMessagingSettings,
        waitForWhatsappReady: overrides.waitForWhatsappReady || transportModule.waitForReady,
        now: overrides.now,
    };
}
