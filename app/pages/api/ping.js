import { getDB } from "./db";
import logger from '../../utils/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getDB();
  try {
    // Simple query to check connection
    await client.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Ping check failed');
    res.status(500).json({ status: 'error', error: error.message });
  } finally {
    client.release();
  }
} 