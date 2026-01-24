import logger from './logger.js';
import { getClient } from './whatsapp-client.js';

/**
 * Sends a WhatsApp message using the internal singleton client.
 * @param {Object} options
 * @param {string} options.to - Destination WhatsApp number (e.g. 'whatsapp:+972501234567') or just number
 * @param {string} options.body - Message body
 */
export async function sendWhatsAppMessage({ to, body }) {
    if (!to || !body) {
        throw new Error('Missing "to" or "body" for WhatsApp message');
    }

    try {
        const client = getClient();

        // Wait for ready state if initializing? 
        // For now, assume if it's called, we hope it's ready or throw
        const globalAny = global;
        const status = globalAny.whatsappStatus;

        if (status !== 'READY' && status !== 'AUTHENTICATED') {
            throw new Error(`WhatsApp client not ready (Status: ${status}). Please scan QR code in settings.`);
        }

        // Format phone number
        let chatId = to;
        if (!chatId.includes('@c.us')) {
            // Strip non-digits and "whatsapp:" prefix
            chatId = chatId.replace('whatsapp:', '').replace(/\D/g, '');
            chatId = `${chatId}@c.us`;
        }

        const message = await client.sendMessage(chatId, body);

        logger.info({ to, messageId: message.id._serialized }, 'WhatsApp message sent successfully');
        return { success: true, messageId: message.id._serialized };
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error sending WhatsApp message');
        throw error;
    }
}
