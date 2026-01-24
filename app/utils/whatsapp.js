import logger from './logger.js';
import { getClient } from './whatsapp-client.js';

/**
 * Sends a WhatsApp message using the internal singleton client.
 * @param {Object} options
 * @param {string} options.to - Destination WhatsApp number(s) or Group ID(s), comma-separated (e.g. 'whatsapp:+972501234567, 1234567890@g.us')
 * @param {string} options.body - Message body
 */
export async function sendWhatsAppMessage({ to, body }) {
    if (!to || !body) {
        throw new Error('Missing "to" or "body" for WhatsApp message');
    }

    try {
        const client = getClient();
        const globalAny = global;
        const status = globalAny.whatsappStatus;

        if (status !== 'READY' && status !== 'AUTHENTICATED') {
            throw new Error(`WhatsApp client not ready (Status: ${status}). Please scan QR code in settings.`);
        }

        // Split by comma for multiple recipients
        const recipients = to.split(',').map(r => r.trim()).filter(Boolean);
        const results = [];

        for (const recipient of recipients) {
            let chatId = recipient;

            // Handle group IDs (usually end with @g.us)
            if (chatId.includes('@g.us')) {
                // It's already a group ID, use as is
            } else if (!chatId.includes('@c.us')) {
                // Strip non-digits and "whatsapp:" prefix for individual numbers
                chatId = chatId.replace('whatsapp:', '').replace(/\D/g, '');
                chatId = `${chatId}@c.us`;
            }

            try {
                const message = await client.sendMessage(chatId, body);
                logger.info({ to: recipient, chatId, messageId: message.id._serialized }, 'WhatsApp message sent successfully');
                results.push({ success: true, to: recipient, messageId: message.id._serialized });
            } catch (sendError) {
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
