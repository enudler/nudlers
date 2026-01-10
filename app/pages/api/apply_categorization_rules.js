import { createApiHandler } from "./utils/apiHandler";
import { getDB } from "./db";

const handler = createApiHandler({
  validate: (req) => {
    if (req.method !== 'POST') {
      return "Only POST method is allowed";
    }
  },
  query: async (req) => {
    // This is a special case where we need to execute multiple queries
    // We'll handle this in the transform function
    return {
      sql: 'SELECT 1', // Dummy query
      params: []
    };
  },
  transform: async (result, req) => {
    const client = await getDB();
    
    try {
      // Get all active rules
      const rulesResult = await client.query(`
        SELECT id, name_pattern, target_category
        FROM categorization_rules
        WHERE is_active = true
        ORDER BY id
      `);
      
      const rules = rulesResult.rows;
      let totalUpdated = 0;
      
      // Apply each rule
      for (const rule of rules) {
        const pattern = `%${rule.name_pattern}%`;
        const updateResult = await client.query(`
          UPDATE transactions 
          SET category = $2
          WHERE LOWER(name) LIKE LOWER($1) 
          AND category != $2
          AND category IS NOT NULL
          AND category != 'Bank'
          AND category != 'Income'
        `, [pattern, rule.target_category]);
        
        totalUpdated += updateResult.rowCount;
      }
      
      return {
        success: true,
        rulesApplied: rules.length,
        transactionsUpdated: totalUpdated
      };
    } catch (error) {
      console.error('Error applying categorization rules:', error);
      throw error;
    } finally {
      client.release();
    }
  }
});

export default handler; 