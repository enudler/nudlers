/**
 * Database Import API
 * Imports database from a JSON backup file
 * 
 * Supports two modes:
 * - replace: Clears existing data and imports backup (default)
 * - merge: Adds new data without removing existing (uses ON CONFLICT)
 */

import { getDB } from '../db';

// Tables to import (in order to handle foreign key dependencies)
const TABLES_IMPORT_ORDER = [
  'vendor_credentials',
  'transactions',
  'categorization_rules',
  'scrape_events',
  'card_ownership',
  'budgets',
  'card_vendors'
];

// Tables that should be cleared in reverse order due to FK constraints
const TABLES_CLEAR_ORDER = [...TABLES_IMPORT_ORDER].reverse();

// Primary key configurations for each table (for ON CONFLICT handling)
const TABLE_CONFIGS = {
  vendor_credentials: {
    pk: 'id',
    uniqueColumns: ['id'],
    skipColumns: [] // id is SERIAL, but we want to preserve it from backup
  },
  transactions: {
    pk: ['identifier', 'vendor'],
    uniqueColumns: ['identifier', 'vendor'],
    skipColumns: []
  },
  categorization_rules: {
    pk: 'id',
    uniqueColumns: ['id'],
    skipColumns: []
  },
  scrape_events: {
    pk: 'id',
    uniqueColumns: ['id'],
    skipColumns: []
  },
  card_ownership: {
    pk: 'id',
    uniqueColumns: ['id'],
    skipColumns: []
  },
  budgets: {
    pk: 'id',
    uniqueColumns: ['id'],
    skipColumns: []
  },
  card_vendors: {
    pk: 'id',
    uniqueColumns: ['id'],
    skipColumns: []
  }
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, mode = 'replace' } = req.body;

  if (!data || !data.tables) {
    return res.status(400).json({ error: 'Invalid backup data format' });
  }

  const client = await getDB();

  try {
    // Start transaction
    await client.query('BEGIN');

    const results = {
      success: true,
      imported: {},
      errors: []
    };

    // In replace mode, clear all tables first (in reverse order for FK constraints)
    if (mode === 'replace') {
      for (const tableName of TABLES_CLEAR_ORDER) {
        try {
          // Use TRUNCATE with CASCADE to handle foreign keys
          await client.query(`TRUNCATE TABLE ${tableName} CASCADE`);
        } catch (error) {
          // Table might not exist, continue
          console.log(`Could not truncate ${tableName}: ${error.message}`);
        }
      }
    }

    // Import each table in order
    for (const tableName of TABLES_IMPORT_ORDER) {
      const tableData = data.tables[tableName];
      
      if (!tableData || !tableData.data || tableData.data.length === 0) {
        results.imported[tableName] = { count: 0, skipped: true };
        continue;
      }

      try {
        let importedCount = 0;
        
        for (const row of tableData.data) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          
          if (columns.length === 0) continue;

          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const columnNames = columns.map(c => `"${c}"`).join(', ');

          if (mode === 'replace') {
            // Direct insert (table was cleared)
            const query = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;
            await client.query(query, values);
          } else {
            // Merge mode: use ON CONFLICT DO NOTHING
            const config = TABLE_CONFIGS[tableName];
            const conflictTarget = Array.isArray(config.pk) 
              ? `(${config.pk.map(c => `"${c}"`).join(', ')})`
              : `("${config.pk}")`;
            
            const query = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders}) ON CONFLICT ${conflictTarget} DO NOTHING`;
            await client.query(query, values);
          }
          
          importedCount++;
        }

        // Reset sequence for tables with SERIAL primary keys
        if (TABLE_CONFIGS[tableName].pk === 'id') {
          try {
            await client.query(`
              SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), 
                     COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1, false)
            `);
          } catch (seqError) {
            console.log(`Could not reset sequence for ${tableName}: ${seqError.message}`);
          }
        }

        results.imported[tableName] = { count: importedCount };
      } catch (error) {
        console.error(`Error importing ${tableName}:`, error);
        results.errors.push({
          table: tableName,
          error: error.message
        });
      }
    }

    // Commit transaction
    await client.query('COMMIT');

    if (results.errors.length > 0) {
      results.success = false;
    }

    res.status(200).json(results);
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error importing database:', error);
    res.status(500).json({ 
      error: 'Failed to import database',
      message: error.message 
    });
  } finally {
    client.release();
  }
}

export default handler;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb' // Allow large backup files
    }
  }
};
