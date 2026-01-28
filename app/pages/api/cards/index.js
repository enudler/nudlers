import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * Card Vendors Collection
 *
 * GET /api/cards - Get all unique card endings from transactions with their vendor mappings
 * POST /api/cards - Create or update a card vendor mapping
 *
 * For individual card operations (GET/PUT/DELETE by last4_digits), use /api/cards/{last4_digits}
 */
export default async function handler(req, res) {
  const client = await getDB();

  try {
    if (req.method === "GET") {
      // Get all unique last 4 digits from transactions and their associated card vendors
      // Also include card ownership and bank account information
      const result = await client.query(`
        WITH unique_cards AS (
          SELECT DISTINCT
            RIGHT(account_number, 4) as last4_digits,
            COUNT(*) as transaction_count
          FROM transactions
          WHERE account_number IS NOT NULL
            AND account_number != ''
            AND LENGTH(account_number) >= 4
            AND (transaction_type IS NULL OR transaction_type != 'bank')
          GROUP BY RIGHT(account_number, 4)
        )
        SELECT
          uc.last4_digits,
          uc.transaction_count,
          cv.card_vendor,
          cv.card_nickname,
          cv.id as card_vendor_id,
          co.id as card_ownership_id,
          co.linked_bank_account_id,
          ba.id as bank_account_id,
          ba.nickname as bank_account_nickname,
          ba.bank_account_number,
          ba.vendor as bank_account_vendor,
          co.custom_bank_account_number,
          co.custom_bank_account_nickname
        FROM unique_cards uc
        LEFT JOIN card_vendors cv ON uc.last4_digits = cv.last4_digits
        LEFT JOIN card_ownership co ON uc.last4_digits = RIGHT(co.account_number, 4)
        LEFT JOIN vendor_credentials ba ON co.linked_bank_account_id = ba.id
        ORDER BY uc.transaction_count DESC
      `);

      res.status(200).json(result.rows);
    } else if (req.method === "POST") {
      // Create or update a card vendor mapping
      const { last4_digits, card_vendor, card_nickname } = req.body;

      if (!last4_digits || !card_vendor) {
        return res.status(400).json({ error: "last4_digits and card_vendor are required" });
      }

      // Upsert the card vendor
      const result = await client.query(
        `INSERT INTO card_vendors (last4_digits, card_vendor, card_nickname, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (last4_digits)
         DO UPDATE SET
           card_vendor = EXCLUDED.card_vendor,
           card_nickname = EXCLUDED.card_nickname,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [last4_digits, card_vendor, card_nickname || null]
      );

      res.status(201).json(result.rows[0]);
    } else {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).json({ error: `Method ${req.method} Not Allowed. Use /api/cards/{last4_digits} for DELETE` });
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in card_vendors API");
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  } finally {
    client.release();
  }
}
