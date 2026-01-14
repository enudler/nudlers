import { getDB } from './db';
import logger from '../../utils/logger.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Missing scrape ID' });
    }

    const client = await getDB();

    try {
        const result = await client.query(
            `SELECT report_json FROM scrape_events WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Scrape event not found' });
        }

        const report = result.rows[0].report_json;

        res.status(200).json(report || { processedTransactions: [], savedTransactions: 0 });
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Get scrape report error');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}
