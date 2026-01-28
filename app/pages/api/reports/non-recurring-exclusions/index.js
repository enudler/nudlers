import { getDB } from "../../db";
import logger from '../../../../utils/logger.js';

/**
 * Non-Recurring Exclusions Collection
 *
 * GET /api/reports/non-recurring-exclusions - List all non-recurring exclusions
 * POST /api/reports/non-recurring-exclusions - Mark a transaction as non-recurring (add exclusion)
 *
 * For individual exclusion operations (GET/DELETE by ID), use /api/reports/non-recurring-exclusions/{id}
 */
export default async function handler(req, res) {
  const client = await getDB();

  try {
    if (req.method === 'GET') {
      // List all exclusions
      const result = await client.query(`
        SELECT id, name, account_number, created_at
        FROM non_recurring_exclusions
        ORDER BY created_at DESC
      `);

      return res.status(200).json({
        exclusions: result.rows,
        total: result.rows.length
      });
    }

    if (req.method === 'POST') {
      // Add a new exclusion
      const { name, account_number } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      // Use COALESCE to handle null account_number in the unique constraint
      const result = await client.query(`
        INSERT INTO non_recurring_exclusions (name, account_number)
        VALUES ($1, $2)
        ON CONFLICT ((LOWER(TRIM(name))), COALESCE(account_number, '')) DO NOTHING
        RETURNING id, name, account_number, created_at
      `, [name.trim(), account_number || null]);

      if (result.rows.length === 0) {
        // Already exists
        return res.status(200).json({
          success: true,
          message: 'Already marked as non-recurring',
          alreadyExisted: true
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Marked as non-recurring',
        exclusion: result.rows[0]
      });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed. Use /api/reports/non-recurring-exclusions/{id} for DELETE' });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error managing non-recurring exclusions");
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}
