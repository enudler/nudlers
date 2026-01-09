import { createAuthenticatedApiHandler } from "./middleware/auth";
import { getDB } from "./db";

/**
 * API for detecting and managing duplicate transactions.
 * 
 * GET: Find potential duplicates in the database
 * POST: Mark duplicates as resolved (keep one, delete the other)
 */

async function handler(req, res) {
  const client = await getDB();
  
  try {
    if (req.method === 'GET') {
      // Find potential duplicates based on business fields
      // Two transactions are potential duplicates if they have:
      // - Same vendor
      // - Same date (or within 1 day)
      // - Same absolute price
      // - Similar description (first 20 chars match or high similarity)
      
      const { status = 'all', limit = 100 } = req.query;
      
      // First, detect new potential duplicates
      const detectQuery = `
        WITH duplicate_groups AS (
          SELECT 
            t1.identifier as id1,
            t1.vendor as vendor1,
            t2.identifier as id2,
            t2.vendor as vendor2,
            t1.name as name1,
            t2.name as name2,
            t1.date as date1,
            t2.date as date2,
            t1.price as price1,
            t2.price as price2,
            t1.account_number as account1,
            t2.account_number as account2,
            -- Calculate similarity based on matching fields
            CASE 
              WHEN t1.identifier = t2.identifier THEN 1.0
              WHEN LOWER(TRIM(t1.name)) = LOWER(TRIM(t2.name)) 
                   AND t1.date = t2.date 
                   AND ABS(t1.price) = ABS(t2.price) THEN 0.95
              WHEN LEFT(LOWER(TRIM(t1.name)), 20) = LEFT(LOWER(TRIM(t2.name)), 20)
                   AND t1.date = t2.date 
                   AND ABS(t1.price) = ABS(t2.price) THEN 0.85
              ELSE 0.7
            END as similarity
          FROM transactions t1
          INNER JOIN transactions t2 
            ON t1.vendor = t2.vendor
            AND t1.date BETWEEN t2.date - INTERVAL '1 day' AND t2.date + INTERVAL '1 day'
            AND ABS(t1.price) = ABS(t2.price)
            AND (t1.identifier, t1.vendor) < (t2.identifier, t2.vendor)  -- Avoid duplicates and self-joins
          WHERE t1.vendor NOT LIKE 'manual_%'
            AND (
              -- Exact description match
              LOWER(TRIM(t1.name)) = LOWER(TRIM(t2.name))
              -- Or first 20 chars match
              OR LEFT(LOWER(TRIM(t1.name)), 20) = LEFT(LOWER(TRIM(t2.name)), 20)
            )
        )
        SELECT * FROM duplicate_groups
        WHERE similarity >= 0.7
        ORDER BY date1 DESC, similarity DESC
        LIMIT $1
      `;
      
      const duplicates = await client.query(detectQuery, [parseInt(limit)]);
      
      // Get existing tracked duplicates
      const trackedQuery = `
        SELECT 
          pd.*,
          t1.name as name1, t1.date as date1, t1.price as price1, t1.account_number as account1,
          t2.name as name2, t2.date as date2, t2.price as price2, t2.account_number as account2
        FROM potential_duplicates pd
        LEFT JOIN transactions t1 ON pd.transaction1_id = t1.identifier AND pd.transaction1_vendor = t1.vendor
        LEFT JOIN transactions t2 ON pd.transaction2_id = t2.identifier AND pd.transaction2_vendor = t2.vendor
        WHERE ($1 = 'all' OR pd.status = $1)
        ORDER BY pd.created_at DESC
        LIMIT $2
      `;
      
      const tracked = await client.query(trackedQuery, [status, parseInt(limit)]);
      
      res.status(200).json({
        detected: duplicates.rows,
        tracked: tracked.rows,
        summary: {
          detectedCount: duplicates.rows.length,
          pendingCount: tracked.rows.filter(r => r.status === 'pending').length,
          resolvedCount: tracked.rows.filter(r => r.status !== 'pending').length
        }
      });
      
    } else if (req.method === 'POST') {
      const { action, transaction1, transaction2 } = req.body;
      
      if (!action || !transaction1 || !transaction2) {
        return res.status(400).json({ 
          error: 'Missing required fields: action, transaction1, transaction2' 
        });
      }
      
      const { identifier: id1, vendor: vendor1 } = transaction1;
      const { identifier: id2, vendor: vendor2 } = transaction2;
      
      if (action === 'delete_first') {
        // Delete the first transaction, keep the second
        await client.query(
          'DELETE FROM transactions WHERE identifier = $1 AND vendor = $2',
          [id1, vendor1]
        );
        
        // Track the resolution
        await client.query(`
          INSERT INTO potential_duplicates 
            (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor, 
             similarity_score, status, resolved_at, resolved_action)
          VALUES ($1, $2, $3, $4, 1.0, 'confirmed_duplicate', NOW(), 'kept_second')
          ON CONFLICT (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor) 
          DO UPDATE SET status = 'confirmed_duplicate', resolved_at = NOW(), resolved_action = 'kept_second'
        `, [id1, vendor1, id2, vendor2]);
        
        res.status(200).json({ success: true, deleted: transaction1 });
        
      } else if (action === 'delete_second') {
        // Delete the second transaction, keep the first
        await client.query(
          'DELETE FROM transactions WHERE identifier = $1 AND vendor = $2',
          [id2, vendor2]
        );
        
        await client.query(`
          INSERT INTO potential_duplicates 
            (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor, 
             similarity_score, status, resolved_at, resolved_action)
          VALUES ($1, $2, $3, $4, 1.0, 'confirmed_duplicate', NOW(), 'kept_first')
          ON CONFLICT (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor) 
          DO UPDATE SET status = 'confirmed_duplicate', resolved_at = NOW(), resolved_action = 'kept_first'
        `, [id1, vendor1, id2, vendor2]);
        
        res.status(200).json({ success: true, deleted: transaction2 });
        
      } else if (action === 'not_duplicate') {
        // Mark as not duplicate (user confirmed they are different transactions)
        await client.query(`
          INSERT INTO potential_duplicates 
            (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor, 
             similarity_score, status, resolved_at, resolved_action)
          VALUES ($1, $2, $3, $4, 1.0, 'not_duplicate', NOW(), 'kept_both')
          ON CONFLICT (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor) 
          DO UPDATE SET status = 'not_duplicate', resolved_at = NOW(), resolved_action = 'kept_both'
        `, [id1, vendor1, id2, vendor2]);
        
        res.status(200).json({ success: true, markedAsNotDuplicate: true });
        
      } else if (action === 'delete_both') {
        // Delete both transactions
        await client.query(
          'DELETE FROM transactions WHERE (identifier = $1 AND vendor = $2) OR (identifier = $3 AND vendor = $4)',
          [id1, vendor1, id2, vendor2]
        );
        
        await client.query(`
          INSERT INTO potential_duplicates 
            (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor, 
             similarity_score, status, resolved_at, resolved_action)
          VALUES ($1, $2, $3, $4, 1.0, 'confirmed_duplicate', NOW(), 'deleted_both')
          ON CONFLICT (transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor) 
          DO UPDATE SET status = 'confirmed_duplicate', resolved_at = NOW(), resolved_action = 'deleted_both'
        `, [id1, vendor1, id2, vendor2]);
        
        res.status(200).json({ success: true, deleted: [transaction1, transaction2] });
        
      } else {
        return res.status(400).json({ error: 'Invalid action. Use: delete_first, delete_second, not_duplicate, delete_both' });
      }
      
    } else if (req.method === 'DELETE') {
      // Bulk delete duplicates - automatically keeps the first occurrence
      const { autoResolve = false, dryRun = true } = req.query;
      
      if (!autoResolve) {
        return res.status(400).json({ 
          error: 'Set autoResolve=true to automatically resolve duplicates' 
        });
      }
      
      // Find exact duplicates (same name, date, price, vendor)
      const exactDuplicatesQuery = `
        WITH ranked AS (
          SELECT 
            identifier, vendor, name, date, price, account_number,
            ROW_NUMBER() OVER (
              PARTITION BY vendor, date, LOWER(TRIM(name)), ABS(price)
              ORDER BY 
                CASE WHEN account_number IS NOT NULL THEN 0 ELSE 1 END,
                identifier
            ) as rn
          FROM transactions
          WHERE vendor NOT LIKE 'manual_%'
        )
        SELECT identifier, vendor, name, date, price, account_number
        FROM ranked
        WHERE rn > 1
      `;
      
      const duplicatesToDelete = await client.query(exactDuplicatesQuery);
      
      if (dryRun === 'false' || dryRun === false) {
        // Actually delete the duplicates
        for (const dup of duplicatesToDelete.rows) {
          await client.query(
            'DELETE FROM transactions WHERE identifier = $1 AND vendor = $2',
            [dup.identifier, dup.vendor]
          );
        }
        
        res.status(200).json({
          success: true,
          deleted: duplicatesToDelete.rows.length,
          transactions: duplicatesToDelete.rows
        });
      } else {
        res.status(200).json({
          dryRun: true,
          wouldDelete: duplicatesToDelete.rows.length,
          transactions: duplicatesToDelete.rows
        });
      }
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
    
  } catch (error) {
    console.error('Duplicates API error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

export default createAuthenticatedApiHandler({
  customHandler: handler
});
