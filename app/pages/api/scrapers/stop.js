import { getDB } from '../db';
import logger from '../../../utils/logger.js';
import { stopAllScrapers } from '../utils/scraperUtils';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const client = await getDB();
    try {
        await stopAllScrapers(client);
        res.status(200).json({
            success: true,
            message: 'All scrapers have been stopped and browser processes killed.'
        });
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error in /api/stop_scrapers');
        res.status(500).json({
            success: false,
            message: 'Failed to stop scrapers.',
            error: error.message
        });
    } finally {
        client.release();
    }
}
