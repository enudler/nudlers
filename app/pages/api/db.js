import { Pool } from "pg";
import logger from '../../utils/logger.js';

export const pool = new Pool({
  user: process.env.NUDLERS_DB_USER,
  host: process.env.NUDLERS_DB_HOST,
  database: process.env.NUDLERS_DB_NAME,
  password: process.env.NUDLERS_DB_PASSWORD,
  port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
  ssl: false,
  // Optimization for Docker/Low Resource environments
  max: process.env.LOW_RESOURCES_MODE === 'true' ? 5 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Keepalive settings to prevent idle connections from being terminated
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Allow proper cleanup when the application exits
  allowExitOnIdle: true,
});

// Handle pool-level errors to prevent unhandled exceptions
pool.on('error', (err, client) => {
  logger.error({ error: err.message, stack: err.stack }, "Unexpected error on idle database client");
});

// Log when connections are acquired and released (debug level)
pool.on('connect', (client) => {
  logger.debug("New database connection established");
});

pool.on('remove', (client) => {
  logger.debug("Database connection removed from pool");
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
