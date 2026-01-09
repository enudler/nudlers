import { Pool } from "pg";

const pool = new Pool({
  user: process.env.NUDLERS_DB_USER,
  host: process.env.NUDLERS_DB_HOST,
  database: process.env.NUDLERS_DB_NAME,
  password: process.env.NUDLERS_DB_PASSWORD,
  port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
  ssl: false,
});


export async function getDB() {
  try {
    const client = await pool.connect();
    return client;
  } catch (error) {
    console.error("Error connecting to the database:", error);
    throw new Error("Database connection failed");
  }
}
