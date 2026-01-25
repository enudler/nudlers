import { Pool } from "pg";
import logger from '../../utils/logger.js';
import { getDatabaseConfig } from '../../config/resource-config.js';

// Get database configuration from centralized resource config
const dbConfig = getDatabaseConfig();

export const pool = new Pool({
  user: process.env.NUDLERS_DB_USER,
  host: process.env.NUDLERS_DB_HOST,
  database: process.env.NUDLERS_DB_NAME,
  password: process.env.NUDLERS_DB_PASSWORD,
  port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
  ssl: false,
  // Pool settings from centralized resource config (respects RESOURCE_MODE and env overrides)
  ...dbConfig,
});

export async function getDB() {
  try {
    const client = await pool.connect();
    return client;
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error connecting to the database");
    throw new Error("Database connection failed");
  }
}
