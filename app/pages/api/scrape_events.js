import { getDB } from './db';
import logger from '../../utils/logger.js';

export default async function handler(req, res) {
  const client = await getDB();
  try {
    switch (req.method) {
      case 'GET': {
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const result = await client.query(
          `SELECT id, triggered_by, vendor, start_date, status, message, report_json, created_at
           FROM scrape_events
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        );

        // Helper to enrich message with fetched count from report_json
        const enrichMessage = (item) => {
          if (item && item.report_json && item.message && item.message.includes('Success')) {
            // If message doesn't already have "fetched=", try to add it
            if (!item.message.includes('fetched=')) {
              const stats = item.report_json;
              if (typeof stats.transactions === 'number') {
                if (item.message.includes('saved=')) {
                  item.message = item.message.replace('saved=', `fetched=${stats.transactions}, saved=`);
                } else {
                  item.message = `${item.message} (fetched=${stats.transactions})`;
                }
              }
            }
          }
        };

        result.rows.forEach(enrichMessage);

        res.status(200).json(result.rows);
        break;
      }
      default:
        res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Error in /api/scrape_events');
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
