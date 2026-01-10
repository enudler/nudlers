import { getDB } from "./db";

/**
 * Cleanup duplicate transactions API
 * 
 * Finds and removes duplicate transactions based on business key:
 * (vendor, name, price, account_number) with dates within 1 day of each other
 * 
 * This handles timezone-related duplicates where the same transaction
 * appears with dates off by 1 day due to UTC/local timezone differences.
 * 
 * When duplicates exist, keeps the one with the most recent processed_date
 * (or the first one if processed_dates are equal/null)
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    // GET: Show duplicates without deleting
    const client = await getDB();
    try {
      // Find timezone-related duplicates: same transaction within 1-day window
      const result = await client.query(`
        WITH potential_duplicates AS (
          SELECT 
            t1.identifier as id1,
            t1.vendor as vendor1,
            t1.date as date1,
            t1.name as name1,
            t1.price as price1,
            t1.account_number as acct1,
            t1.processed_date as proc_date1,
            t2.identifier as id2,
            t2.vendor as vendor2,
            t2.date as date2,
            t2.name as name2,
            t2.processed_date as proc_date2
          FROM transactions t1
          JOIN transactions t2 ON 
            t1.vendor = t2.vendor
            AND LOWER(TRIM(t1.name)) = LOWER(TRIM(t2.name))
            AND ABS(t1.price) = ABS(t2.price)
            AND COALESCE(t1.account_number, '') = COALESCE(t2.account_number, '')
            AND t1.identifier < t2.identifier  -- Avoid counting pairs twice
            AND ABS(t1.date - t2.date) <= 1    -- Within 1 day (timezone duplicates)
          WHERE t1.vendor NOT LIKE 'manual_%'
        )
        SELECT 
          vendor1 as vendor,
          name1 as name,
          price1 as price,
          acct1 as account_number,
          date1,
          date2,
          id1 as identifier_1,
          id2 as identifier_2,
          proc_date1,
          proc_date2,
          CASE 
            WHEN proc_date1 IS NOT NULL AND proc_date2 IS NULL THEN id2
            WHEN proc_date2 IS NOT NULL AND proc_date1 IS NULL THEN id1
            WHEN proc_date1 >= proc_date2 OR proc_date2 IS NULL THEN id2
            ELSE id1
          END as to_delete
        FROM potential_duplicates
        ORDER BY date1 DESC
      `);
      
      res.status(200).json({
        message: `Found ${result.rows.length} duplicate pairs (timezone-related)`,
        duplicatePairs: result.rows.length,
        totalDuplicatesToDelete: result.rows.length,
        duplicates: result.rows
      });
    } catch (error) {
      console.error("Error finding duplicates:", error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  } else if (req.method === 'DELETE') {
    // DELETE: Actually remove duplicates
    const client = await getDB();
    try {
      await client.query('BEGIN');
      
      // Delete timezone-related duplicates (same transaction within 1 day)
      // Keep the one with the most recent processed_date
      const result = await client.query(`
        WITH potential_duplicates AS (
          SELECT 
            t1.identifier as id1,
            t1.vendor as vendor1,
            t1.processed_date as proc_date1,
            t2.identifier as id2,
            t2.vendor as vendor2,
            t2.processed_date as proc_date2
          FROM transactions t1
          JOIN transactions t2 ON 
            t1.vendor = t2.vendor
            AND LOWER(TRIM(t1.name)) = LOWER(TRIM(t2.name))
            AND ABS(t1.price) = ABS(t2.price)
            AND COALESCE(t1.account_number, '') = COALESCE(t2.account_number, '')
            AND t1.identifier < t2.identifier
            AND ABS(t1.date - t2.date) <= 1
          WHERE t1.vendor NOT LIKE 'manual_%'
        ),
        to_delete AS (
          SELECT 
            CASE 
              WHEN proc_date1 IS NOT NULL AND proc_date2 IS NULL THEN id2
              WHEN proc_date2 IS NOT NULL AND proc_date1 IS NULL THEN id1
              WHEN proc_date1 >= proc_date2 OR proc_date2 IS NULL THEN id2
              ELSE id1
            END as identifier,
            CASE 
              WHEN proc_date1 IS NOT NULL AND proc_date2 IS NULL THEN vendor2
              WHEN proc_date2 IS NOT NULL AND proc_date1 IS NULL THEN vendor1
              WHEN proc_date1 >= proc_date2 OR proc_date2 IS NULL THEN vendor2
              ELSE vendor1
            END as vendor
          FROM potential_duplicates
        )
        DELETE FROM transactions
        WHERE (identifier, vendor) IN (SELECT identifier, vendor FROM to_delete)
        RETURNING identifier, vendor, name, date, price
      `);
      
      await client.query('COMMIT');
      
      res.status(200).json({
        message: `Deleted ${result.rowCount} duplicate transactions`,
        deletedCount: result.rowCount,
        deleted: result.rows.slice(0, 50)
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error deleting duplicates:", error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  } else {
    res.setHeader('Allow', ['GET', 'DELETE']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}
