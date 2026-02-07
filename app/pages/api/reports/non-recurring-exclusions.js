import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * API endpoint to manage non-recurring exclusions.
 *
 * GET: List all non-recurring exclusions
 * POST: Mark a transaction as non-recurring (add exclusion)
 * DELETE: Unmark a transaction as non-recurring (remove exclusion)
 *
 * POST/DELETE Body:
 * - name: string (required) - The transaction name
 * - account_number: string (optional) - The account number for more specific exclusions
 */
export default async function handler(req, res) {
  const client = await getDB();

  try {
    if (req.method === 'GET') {
      // List all exclusions
      const result = await client.query(`
        WITH account_details AS (
          SELECT DISTINCT ON (account_number) 
            account_number, 
            vendor, 
            transaction_type,
            COALESCE(vendor_nickname, bank_nickname) as nickname
          FROM (
            SELECT 
              t.account_number, 
              t.vendor, 
              t.transaction_type,
              vc.nickname as vendor_nickname,
              vc.nickname as bank_nickname
            FROM transactions t
            LEFT JOIN vendor_credentials vc ON (
              (t.transaction_type = 'bank' AND t.account_number = vc.bank_account_number) OR
              (t.transaction_type != 'bank' AND t.account_number = vc.card6_digits) -- Best effort join
            )
            WHERE t.account_number IS NOT NULL
          ) src
        )
        SELECT
          n.id,
          n.name,
          n.account_number,
          n.created_at,
          ad.vendor,
          ad.nickname as bank_nickname, -- Reuse nickname field for display
          n.account_number as bank_account_display,
          COALESCE(ad.transaction_type, 'card') as transaction_type
        FROM non_recurring_exclusions n
        LEFT JOIN account_details ad ON n.account_number = ad.account_number
        ORDER BY n.created_at DESC
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

    if (req.method === 'DELETE') {
      // Remove an exclusion
      const { name, account_number } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const result = await client.query(`
        DELETE FROM non_recurring_exclusions
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
          AND (
            (account_number IS NULL AND $2 IS NULL) OR
            (account_number = $2)
          )
        RETURNING id
      `, [name, account_number || null]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Exclusion not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Unmarked as non-recurring'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error managing non-recurring exclusions");
    res.status(500).json({
      error: "Internal Server Error"
    });
  } finally {
    client.release();
  }
}
