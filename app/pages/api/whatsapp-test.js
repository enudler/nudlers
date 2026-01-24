import { getDB } from './db.js';
import { generateDailySummary } from '../../utils/summary.js';
import { sendWhatsAppMessage } from '../../utils/whatsapp.js';
import logger from '../../utils/logger.js';

/**
 * POST /api/whatsapp-test
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
             WHERE key IN ('whatsapp_enabled', 'whatsapp_to')`
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
                error: 'Missing "To Number" setting in WhatsApp configuration.',
                message: null
            });
        }

        // Generate the summary message
        let generatedMessage;
        try {
            logger.info('[whatsapp-test] Generating daily summary for test');
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
            logger.info({ to: settings.whatsapp_to }, '[whatsapp-test] Attempting to send test message');
            const result = await sendWhatsAppMessage({
                to: settings.whatsapp_to,
                body: generatedMessage
            });

            logger.info('[whatsapp-test] Test message sent successfully');

            return res.status(200).json({
                success: true,
                message: generatedMessage,
                results: result.results,
                error: null
            });
        } catch (sendError) {
            logger.error({ error: sendError.message }, '[whatsapp-test] Failed to send message');

            return res.status(500).json({
                success: false,
                error: sendError.message,
                message: generatedMessage // Still return the generated message for UI display
            });
        }
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, '[whatsapp-test] Unexpected error in handler');
        return res.status(500).json({
            success: false,
            error: `Internal server error: ${error.message}`,
            message: null
        });
    } finally {
        client.release();
    }
}
