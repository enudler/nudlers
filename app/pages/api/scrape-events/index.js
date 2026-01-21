import { getDB } from '../db';
import logger from '../../../utils/logger.js';

export default async function handler(req, res) {
  const client = await getDB();
  try {
    switch (req.method) {
      case 'GET': {
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const result = await client.query(
          `SELECT id, triggered_by, vendor, start_date, status, message, created_at, report_json, duration_seconds
           FROM scrape_events
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        );
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
