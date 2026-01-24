import { getDB } from './db.js';
import { generateDailySummary } from '../../utils/summary.js';
import { sendWhatsAppMessage } from '../../utils/whatsapp.js';
import logger from '../../utils/logger.js';

/**
 * POST /api/whatsapp_test
 * Tests the WhatsApp configuration by generating a summary and sending it.
 * Returns the generated message and send status.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const client = await getDB();

    try {
        // Get WhatsApp settings
        const settingsResult = await client.query(
            `SELECT key, value FROM app_settings 
             WHERE key IN ('whatsapp_twilio_sid', 'whatsapp_twilio_auth_token', 
                           'whatsapp_twilio_from', 'whatsapp_to')`
        );

        const settings = {};
        for (const row of settingsResult.rows) {
            settings[row.key] = typeof row.value === 'string'
                ? row.value.replace(/"/g, '')
                : row.value;
        }

        // Validate required settings
        if (!settings.whatsapp_to) {
            return res.status(400).json({
                success: false,
                error: 'Missing "To Number" setting',
                message: null
            });
        }

        // Generate the summary message
        let generatedMessage;
        try {
            generatedMessage = await generateDailySummary();
        } catch (summaryError) {
            logger.error({ error: summaryError.message }, '[whatsapp-test] Failed to generate summary');
            return res.status(500).json({
                success: false,
                error: `Failed to generate summary: ${summaryError.message}`,
                message: null
            });
        }

        // Send the WhatsApp message
        try {
            await sendWhatsAppMessage({
                to: settings.whatsapp_to,
                body: generatedMessage
            });

            logger.info('[whatsapp-test] Test message sent successfully');

            return res.status(200).json({
                success: true,
                message: generatedMessage,
                error: null
            });
        } catch (sendError) {
            logger.error({ error: sendError.message, stack: sendError.stack }, '[whatsapp-test] Failed to send message');

            return res.status(500).json({
                success: false,
                error: `Failed to send message: ${sendError.message}`,
                message: generatedMessage // Still return the generated message
            });
        }
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, '[whatsapp-test] Unexpected error');
        return res.status(500).json({
            success: false,
            error: `Unexpected error: ${error.message}`,
            message: null
        });
    } finally {
        client.release();
    }
}
