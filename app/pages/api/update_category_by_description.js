import { createAuthenticatedApiHandler } from "./middleware/auth";
import { getDB } from "./db";

/**
 * API endpoint to update category for all transactions with a given description
 * and create/update a categorization rule for future transactions.
 * 
 * POST body:
 * - description: string - The transaction description to match
 * - newCategory: string - The new category to apply
 * - createRule: boolean (optional, default true) - Whether to create a categorization rule
 */
const handler = createAuthenticatedApiHandler({
  validate: (req) => {
    if (req.method !== 'POST') {
      return "Only POST method is allowed";
    }
    
    const { description, newCategory } = req.body;
    if (!description || !newCategory) {
      return "description and newCategory are required";
    }
  },
  query: async (req) => {
    // We'll handle all logic in transform since we need multiple queries
    return {
      sql: 'SELECT 1',
      params: []
    };
  },
  transform: async (result, req) => {
    const { description, newCategory, createRule = true } = req.body;
    const client = await getDB();
    
    try {
      // Start a transaction
      await client.query('BEGIN');
      
      // 1. Update all transactions with this description
      const updateResult = await client.query(`
        UPDATE transactions 
        SET category = $2
        WHERE LOWER(name) = LOWER($1)
        RETURNING identifier, vendor
      `, [description, newCategory]);
      
      const transactionsUpdated = updateResult.rowCount;
      
      // 2. Create or update the categorization rule if requested
      let ruleCreated = false;
      let ruleUpdated = false;
      
      if (createRule) {
        // Check if a rule for this exact pattern already exists
        const existingRule = await client.query(`
          SELECT id, target_category 
          FROM categorization_rules 
          WHERE LOWER(name_pattern) = LOWER($1)
        `, [description]);
        
        if (existingRule.rows.length > 0) {
          // Update existing rule
          await client.query(`
            UPDATE categorization_rules 
            SET target_category = $2, updated_at = CURRENT_TIMESTAMP, is_active = true
            WHERE LOWER(name_pattern) = LOWER($1)
          `, [description, newCategory]);
          ruleUpdated = true;
        } else {
          // Create new rule
          await client.query(`
            INSERT INTO categorization_rules (name_pattern, target_category, is_active)
            VALUES ($1, $2, true)
            ON CONFLICT (name_pattern, target_category) 
            DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP
          `, [description, newCategory]);
          ruleCreated = true;
        }
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        transactionsUpdated,
        ruleCreated,
        ruleUpdated,
        description,
        newCategory
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating category by description:', error);
      throw error;
    } finally {
      client.release();
    }
  }
});

export default handler;
