/**
 * Database Export API
 * Exports all database tables as a JSON backup file
 */

import { getDB } from '../db';
import logger from '../../../utils/logger.js';

// Tables to export (in order to handle foreign key dependencies)
const TABLES_TO_EXPORT = [
  'vendor_credentials',
  'transactions',
  'categorization_rules',
  'scrape_events',
  'card_ownership',
  'budgets',
  'card_vendors'
];

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getDB();

  try {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tables: {}
    };

    // Export each table
    for (const tableName of TABLES_TO_EXPORT) {
      try {
        const result = await client.query(`SELECT * FROM ${tableName}`);
        exportData.tables[tableName] = {
          rowCount: result.rows.length,
          data: result.rows
        };
      } catch (error) {
        // Table might not exist yet, skip it
        logger.warn({ tableName, error: error.message }, 'Table not found or error');
        exportData.tables[tableName] = {
          rowCount: 0,
          data: [],
          error: 'Table not found'
        };
      }
    }

    // Set headers for file download
    const filename = `clarify-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.status(200).json(exportData);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Error exporting database');
    res.status(500).json({ error: 'Failed to export database' });
  } finally {
    client.release();
  }
}

export default handler;
