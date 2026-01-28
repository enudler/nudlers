import { getDB } from "../../db";
import logger from '../../../../utils/logger.js';

/**
 * Non-Recurring Exclusion by ID
 *
 * GET /api/reports/non-recurring-exclusions/[id] - Get a specific exclusion
 * DELETE /api/reports/non-recurring-exclusions/[id] - Remove an exclusion
 */
export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID parameter is required' });
  }

  const client = await getDB();

  try {
    if (req.method === 'GET') {
      const result = await client.query(`
        SELECT id, name, account_number, created_at
        FROM non_recurring_exclusions
        WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Exclusion not found' });
      }

      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const result = await client.query(`
        DELETE FROM non_recurring_exclusions
        WHERE id = $1
        RETURNING id
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Exclusion not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Unmarked as non-recurring'
      });
    }

    res.setHeader('Allow', ['GET', 'DELETE']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in non-recurring-exclusions/[id] API");
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}
