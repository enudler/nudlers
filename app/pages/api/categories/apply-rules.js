import { createApiHandler } from "../utils/apiHandler";
import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * POST /api/categories/apply-rules
 * Apply categorization rules to all existing transactions.
 */
const handler = createApiHandler({
    validate: (req) => {
        if (req.method !== 'POST') return "Only POST method is allowed";
    },
    query: async () => ({ sql: 'SELECT 1' }),
    transform: async (result, req) => {
        const client = await getDB();
        try {
            const rulesResult = await client.query(`
        SELECT id, name_pattern, target_category
        FROM categorization_rules
        WHERE is_active = true
        ORDER BY id
      `);

            const rules = rulesResult.rows;
            let totalUpdated = 0;

            for (const rule of rules) {
                const pattern = `%${rule.name_pattern}%`;
                const updateResult = await client.query(`
          UPDATE transactions 
          SET category = $2
          WHERE LOWER(name) LIKE LOWER($1) 
          AND (category IS NULL OR (
            category != $2 
            AND category != 'Bank' 
            AND category != 'Income'
          ))
        `, [pattern, rule.target_category]);

                totalUpdated += updateResult.rowCount;
            }

            return {
                success: true,
                rulesApplied: rules.length,
                transactionsUpdated: totalUpdated
            };
        } catch (error) {
            logger.error({ error: error.message, stack: error.stack }, 'Error applying categorization rules');
            throw error;
        } finally {
            client.release();
        }
    }
});

export default handler;
