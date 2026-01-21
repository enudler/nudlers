import { getDB } from "../db";
import logger from '../../../utils/logger.js';

// Ensure the total_budget table exists
async function ensureTableExists(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS total_budget (
      id SERIAL PRIMARY KEY,
      budget_limit FLOAT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export default async function handler(req, res) {
  const client = await getDB();

  try {
    // Auto-create table if it doesn't exist
    await ensureTableExists(client);

    if (req.method === "GET") {
      // Get the total budget (single row)
      const sql = `
        SELECT id, budget_limit, created_at, updated_at
        FROM total_budget
        LIMIT 1
      `;

      const result = await client.query(sql);

      if (result.rows.length === 0) {
        // No total budget set yet
        return res.status(200).json({ budget_limit: null, is_set: false });
      }

      res.status(200).json({
        ...result.rows[0],
        is_set: true
      });

    } else if (req.method === "POST" || req.method === "PUT") {
      // Create or update the total budget
      const { budget_limit } = req.body;

      if (budget_limit === undefined || budget_limit === null) {
        return res.status(400).json({
          error: "Missing required field: budget_limit"
        });
      }

      if (budget_limit <= 0) {
        return res.status(400).json({
          error: "Budget limit must be greater than 0"
        });
      }

      // Upsert: Insert if not exists, update if exists
      const sql = `
        INSERT INTO total_budget (id, budget_limit)
        VALUES (1, $1)
        ON CONFLICT (id) 
        DO UPDATE SET budget_limit = $1, updated_at = CURRENT_TIMESTAMP
        RETURNING id, budget_limit, created_at, updated_at
      `;

      const result = await client.query(sql, [budget_limit]);
      res.status(200).json({
        ...result.rows[0],
        is_set: true
      });

    } else if (req.method === "DELETE") {
      // Remove the total budget
      const sql = `DELETE FROM total_budget WHERE id = 1 RETURNING id`;
      const result = await client.query(sql);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "No total budget set" });
      }

      res.status(200).json({ message: "Total budget removed successfully", is_set: false });

    } else {
      res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
      res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in total_budget API");
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}
