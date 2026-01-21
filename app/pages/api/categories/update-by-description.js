import { createApiHandler } from "../utils/apiHandler";
import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * POST /api/categories/update-by-description
 * Update category for all transactions with a given description and optionally create a rule.
 */
const handler = createApiHandler({
    validate: (req) => {
        if (req.method !== 'POST') return "Only POST method is allowed";
        const { description, newCategory } = req.body;
        if (!description || !newCategory) return "description and newCategory are required";
    },
    query: async () => ({ sql: 'SELECT 1' }),
    transform: async (result, req) => {
        const { description, newCategory, createRule = true } = req.body;
        const client = await getDB();
        try {
            await client.query('BEGIN');

            const updateResult = await client.query(`
        UPDATE transactions 
        SET category = $2
        WHERE LOWER(name) = LOWER($1)
      `, [description, newCategory]);

            let ruleCreated = false;
            let ruleUpdated = false;

            if (createRule) {
                const existingRule = await client.query(`
          SELECT id FROM categorization_rules WHERE LOWER(name_pattern) = LOWER($1)
        `, [description]);

                if (existingRule.rows.length > 0) {
                    await client.query(`
            UPDATE categorization_rules 
            SET target_category = $2, updated_at = CURRENT_TIMESTAMP, is_active = true
            WHERE LOWER(name_pattern) = LOWER($1)
          `, [description, newCategory]);
                    ruleUpdated = true;
                } else {
                    await client.query(`
            INSERT INTO categorization_rules (name_pattern, target_category, is_active)
            VALUES ($1, $2, true)
          `, [description, newCategory]);
                    ruleCreated = true;
                }
            }

            await client.query('COMMIT');
            return {
                success: true,
                transactionsUpdated: updateResult.rowCount,
                ruleCreated,
                ruleUpdated,
                description,
                newCategory
            };
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error({ error: error.message, stack: error.stack }, 'Error updating category by description');
            throw error;
        } finally {
            client.release();
        }
    }
});

export default handler;
