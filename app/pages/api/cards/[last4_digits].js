import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * Card Vendor by Last 4 Digits
 *
 * GET /api/cards/[last4_digits] - Get a specific card vendor mapping
 * PUT /api/cards/[last4_digits] - Update a card vendor mapping
 * DELETE /api/cards/[last4_digits] - Delete a card vendor mapping
 */
export default async function handler(req, res) {
  const { last4_digits } = req.query;

  if (!last4_digits) {
    return res.status(400).json({ error: "last4_digits parameter is required" });
  }

  const client = await getDB();

  try {
    if (req.method === "GET") {
      const result = await client.query(
        `SELECT
          cv.id,
          cv.last4_digits,
          cv.card_vendor,
          cv.card_nickname,
          cv.created_at,
          cv.updated_at,
          COUNT(t.identifier) as transaction_count
        FROM card_vendors cv
        LEFT JOIN transactions t ON RIGHT(t.account_number, 4) = cv.last4_digits
        WHERE cv.last4_digits = $1
        GROUP BY cv.id`,
        [last4_digits]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Card vendor not found" });
      }

      res.status(200).json(result.rows[0]);
    } else if (req.method === "PUT") {
      const { card_vendor, card_nickname } = req.body;

      if (!card_vendor) {
        return res.status(400).json({ error: "card_vendor is required" });
      }

      const result = await client.query(
        `UPDATE card_vendors
         SET card_vendor = $2, card_nickname = $3, updated_at = CURRENT_TIMESTAMP
         WHERE last4_digits = $1
         RETURNING *`,
        [last4_digits, card_vendor, card_nickname || null]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Card vendor not found" });
      }

      res.status(200).json(result.rows[0]);
    } else if (req.method === "DELETE") {
      const result = await client.query(
        "DELETE FROM card_vendors WHERE last4_digits = $1 RETURNING id",
        [last4_digits]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Card vendor not found" });
      }

      res.status(200).json({ success: true });
    } else {
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in card_vendors/[last4_digits] API");
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  } finally {
    client.release();
  }
}
