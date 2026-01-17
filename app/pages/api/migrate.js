import { getDB } from "./db.js";
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

export async function runMigrations() {
  const client = await getDB();
  const results = [];

  try {
    logger.info('[migrate] Starting database migrations');

    // 1. Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Get list of migration files
    const migrationsDir = path.join(process.cwd(), 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      logger.warn('[migrate] Migrations directory not found at ' + migrationsDir);
      return { success: true, migrations: [] };
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure they run in alphabetical order

    // 3. Get already applied migrations
    const { rows: appliedRows } = await client.query('SELECT name FROM migrations');
    const appliedMigrations = new Set(appliedRows.map(row => row.name));

    // 4. Run unapplied migrations
    for (const file of migrationFiles) {
      if (appliedMigrations.has(file)) {
        continue;
      }

      logger.info({ migration: file }, '[migrate] Running migration');

      try {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        // Start transaction for each migration file
        await client.query('BEGIN');

        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);

        await client.query('COMMIT');

        results.push({ name: file, status: 'success' });
        logger.info({ migration: file }, '[migrate] Migration completed successfully');
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ migration: file, error: error.message }, '[migrate] Migration failed');
        results.push({ name: file, status: 'error', error: error.message });
        throw error; // Stop execution on first failure
      }
    }

    if (results.length === 0) {
      logger.info('[migrate] No new migrations to apply');
    } else {
      logger.info({ count: results.length }, '[migrate] Database migrations batch completed');
    }

    return { success: true, migrations: results };
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, '[migrate] Migration process failed');
    return { success: false, migrations: results, error: error.message };
  } finally {
    client.release();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await runMigrations();

  if (result.success) {
    res.status(200).json({
      message: 'Migration completed successfully',
      migrations: result.migrations
    });
  } else {
    res.status(500).json({
      error: result.error,
      migrations: result.migrations
    });
  }
}
