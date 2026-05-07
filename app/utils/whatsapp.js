import logger from './logger.js';
import { ensureConnected, sendText } from './whatsapp-transport.js';

/**
 * Heuristic: errors that look like the WA web page is gone (frame detached,
 * Puppeteer protocol error, page closed) — i.e. the client is unhealthy and
 * a reconnect is the only thing that will help. Other errors (`recipient is
 * not a contact`, `chatId not found`) are user-visible and shouldn't trigger
 * a reconnect retry, since reconnecting won't help.
 *
 * Also matches Baileys-side transient symptoms (`connection closed`,
 * `socket closed`, `stream errored`) so the same retry path applies when
 * the WebSocket transport happens to die mid-send.
 */
function looksLikeTransientClientDeath(err) {
    const msg = (err && err.message) ? String(err.message) : String(err);
    return /frame|detached|target closed|page closed|protocol error|session closed|execution context|navigation|connection closed|stream errored|socket (closed|hang up)|websocket/i.test(msg);
}

const TRANSIENT_RETRY_DELAY_MS = 1500;

/**
 * Sends a WhatsApp message. The transport router (whatsapp-transport.js)
 * picks the underlying implementation; we don't care which.
 *
 * Resilience model:
 *  1. ensureConnected() probes the transport and reconnects up front.
 *  2. If sendText *itself* throws something that looks like a dead-transport
 *     error AFTER ensureConnected said we were good, we force one more
 *     reconnect-and-retry. This catches the narrow window where the
 *     underlying socket/page died between the probe and the send.
 *
 * Why not retry every error type? Errors like "recipient not in contacts"
 * or "invalid chat id" are deterministic — retrying just doubles the noise
 * in the logs and might cause duplicate sends if the server accepted the
 * first attempt but couldn't read back the response.
 *
 * @param {Object} options
 * @param {string} options.to    Comma-separated recipients ('whatsapp:+972…',
 *                               '1234567890@c.us', or '120…@g.us' for groups).
 * @param {string} options.body  Message body.
 */
export async function sendWhatsAppMessage({ to, body }) {
    if (!to || !body) {
        throw new Error('Missing "to" or "body" for WhatsApp message');
    }

    try {
        let client = await ensureConnected();

        const recipients = to.split(',').map(r => r.trim()).filter(Boolean);
        const results = [];

        for (const recipient of recipients) {
            let chatId = recipient;

            if (chatId.includes('@g.us')) {
                // Group ID — use as-is.
            } else if (!chatId.includes('@c.us')) {
                chatId = chatId.replace('whatsapp:', '').replace(/\D/g, '');
                chatId = `${chatId}@c.us`;
            }

            try {
                const sent = await sendText({ client, chatId, body });
                logger.info({ to: recipient, chatId, messageId: sent.id }, 'WhatsApp message sent successfully');
                results.push({ success: true, to: recipient, messageId: sent.id });
            } catch (sendError) {
                if (looksLikeTransientClientDeath(sendError)) {
                    logger.warn(
                        { to: recipient, err: sendError.message },
                        'WhatsApp send hit a transient transport-death error; reconnecting and retrying once'
                    );
                    try {
                        await new Promise((r) => setTimeout(r, TRANSIENT_RETRY_DELAY_MS));
                        client = await ensureConnected();
                        const sent = await sendText({ client, chatId, body });
                        logger.info(
                            { to: recipient, chatId, messageId: sent.id },
                            'WhatsApp message sent on retry'
                        );
                        results.push({ success: true, to: recipient, messageId: sent.id, retried: true });
                        continue;
                    } catch (retryErr) {
                        logger.error(
                            { to: recipient, chatId, error: retryErr.message },
                            'WhatsApp retry after reconnect also failed'
                        );
                        results.push({ success: false, to: recipient, error: retryErr.message });
                        continue;
                    }
                }

                logger.error({ to: recipient, chatId, error: sendError.message }, 'Failed to send WhatsApp message to recipient');
                results.push({ success: false, to: recipient, error: sendError.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        if (successCount === 0 && recipients.length > 0) {
            throw new Error(`Failed to send WhatsApp message to all ${recipients.length} recipients`);
        }

        return {
            success: successCount > 0,
            total: recipients.length,
            sent: successCount,
            results
        };
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error in sendWhatsAppMessage process');
        throw error;
    }
}
