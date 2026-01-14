import { getDB } from "../db";
import logger from '../../../utils/logger.js';
import fs from 'fs';

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

      res.status(200).json(result.rows[0]);
    } else if (req.method === "DELETE") {
      // Delete a card vendor mapping
      const { last4_digits } = req.body;

      if (!last4_digits) {
        return res.status(400).json({ error: "last4_digits is required" });
      }

      await client.query(
        "DELETE FROM card_vendors WHERE last4_digits = $1",
        [last4_digits]
      );

      res.status(200).json({ success: true });
    } else {
      res.setHeader("Allow", ["GET", "POST", "DELETE"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in card_vendors API");
    try {
      fs.writeFileSync('/Users/elinudler/Git/nudlers/app/debug_error.log', JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
    } catch (e) {
      console.error("Failed to write log", e);
    }
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  } finally {
    client.release();
  }
}
