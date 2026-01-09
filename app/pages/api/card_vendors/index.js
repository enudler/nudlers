import { getDB } from "../db";

export default async function handler(req, res) {
  const client = await getDB();

  try {
    if (req.method === "GET") {
      // Get all unique last 4 digits from transactions and their associated card vendors
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
          cv.id as card_vendor_id
        FROM unique_cards uc
        LEFT JOIN card_vendors cv ON uc.last4_digits = cv.last4_digits
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
    console.error("Error in card_vendors API:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  } finally {
    client.release();
  }
}
