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
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      return client;
    } catch (error) {
      lastError = error;
      logger.warn({
        error: error.message,
        attempt,
        maxRetries
      }, "Database connection attempt failed");

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff: 1s, 2s)
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  logger.error({ error: lastError.message, stack: lastError.stack }, "Error connecting to the database after all retries");
  throw new Error("Database connection failed");
}
