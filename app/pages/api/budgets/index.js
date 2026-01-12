import { getDB } from "../db";
import logger from '../../../utils/logger.js';

export default async function handler(req, res) {
  const client = await getDB();

  try {
    if (req.method === "GET") {
      // Get all general budgets (one per category)
      const sql = `
        SELECT id, category, budget_limit, created_at, updated_at
        FROM budgets
        ORDER BY category ASC
      `;
      
      const result = await client.query(sql);
      res.status(200).json(result.rows);
      
    } else if (req.method === "POST") {
      // Create or update a general budget for a category
      const { category, budget_limit } = req.body;
      
      if (!category || budget_limit === undefined) {
        return res.status(400).json({ 
          error: "Missing required fields: category, budget_limit" 
        });
      }
      
      const sql = `
        INSERT INTO budgets (category, budget_limit)
        VALUES ($1, $2)
        ON CONFLICT (category) 
        DO UPDATE SET budget_limit = $2, updated_at = CURRENT_TIMESTAMP
        RETURNING id, category, budget_limit, created_at, updated_at
      `;
      
      const result = await client.query(sql, [category, budget_limit]);
      res.status(201).json(result.rows[0]);
      
    } else {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in budgets API");
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: error.message 
    });
  } finally {
    client.release();
  }
}
