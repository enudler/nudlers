import { Pool } from "pg";
import logger from '../../utils/logger.js';

const pool = new Pool({
  user: process.env.NUDLERS_DB_USER,
  host: process.env.NUDLERS_DB_HOST,
  database: process.env.NUDLERS_DB_NAME,
  password: process.env.NUDLERS_DB_PASSWORD,
  port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
  ssl: false,
  // Optimization for Docker/Low Resource environments
  max: process.env.LOW_RESOURCES_MODE === 'true' ? 5 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
