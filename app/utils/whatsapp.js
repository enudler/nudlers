import twilio from 'twilio';
import logger from './logger.js';

/**
 * Sends a WhatsApp message using Twilio.
 * @param {Object} options
 * @param {string} options.sid - Twilio Account SID
 * @param {string} options.authToken - Twilio Auth Token
 * @param {string} options.from - Twilio WhatsApp "From" number (e.g. 'whatsapp:+14155238886')
 * @param {string} options.to - Destination WhatsApp number (e.g. 'whatsapp:+972501234567')
 * @param {string} options.body - Message body
 */
export async function sendWhatsAppMessage({ sid, authToken, from, to, body }) {
    if (!sid || !authToken || !from || !to) {
        throw new Error('Missing Twilio credentials or phone numbers');
    }

    const client = twilio(sid, authToken);

    try {
        const message = await client.messages.create({
            body,
            from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
            to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        });

        logger.info({ messageSid: message.sid }, 'WhatsApp message sent successfully');
        return message;
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error sending WhatsApp message');
        throw error;
    }
}
