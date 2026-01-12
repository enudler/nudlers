import { getDB } from "../db";
import logger from '../../../utils/logger.js';

export default async function handler(req, res) {
  const client = await getDB();
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Budget ID is required" });
  }

  try {
    if (req.method === "PUT") {
      // Update an existing budget
      const { budget_limit } = req.body;
      
      if (budget_limit === undefined) {
        return res.status(400).json({ 
          error: "Missing required field: budget_limit" 
        });
      }
      
      const sql = `
        UPDATE budgets 
        SET budget_limit = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, category, budget_limit, created_at, updated_at
      `;
      
      const result = await client.query(sql, [budget_limit, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Budget not found" });
      }
      
      res.status(200).json(result.rows[0]);
      
    } else if (req.method === "DELETE") {
      // Delete a budget
      const sql = `DELETE FROM budgets WHERE id = $1 RETURNING id`;
      const result = await client.query(sql, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Budget not found" });
      }
      
      res.status(200).json({ message: "Budget deleted successfully" });
      
    } else {
      res.setHeader("Allow", ["PUT", "DELETE"]);
      res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in budget API");
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: error.message 
    });
  } finally {
    client.release();
  }
}
