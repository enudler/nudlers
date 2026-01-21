import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * Categories Resource by Name
 * 
 * PATCH /api/categories/[name] - Rename category
 * DELETE /api/categories/[name] - Delete category (uncategorize transactions)
 */
export default async function handler(req, res) {
    const { name: categoryName } = req.query;

    if (!categoryName) {
        return res.status(400).json({ error: "Category name is required" });
    }

    const client = await getDB();

    try {
        if (req.method === 'PATCH') {
            // RENAME logic
            const { newName } = req.body;
            if (!newName || typeof newName !== 'string' || newName.trim() === '') {
                return res.status(400).json({ error: "New category name is required" });
            }

            const trimmedOldName = categoryName.trim();
            const trimmedNewName = newName.trim();

            await client.query('BEGIN');

            const transactionsResult = await client.query(
                `UPDATE transactions SET category = $1 WHERE category = $2`,
                [trimmedNewName, trimmedOldName]
            );

            const rulesResult = await client.query(
                `UPDATE categorization_rules SET target_category = $1, updated_at = CURRENT_TIMESTAMP WHERE target_category = $2`,
                [trimmedNewName, trimmedOldName]
            );

            const budgetsResult = await client.query(
                `UPDATE budgets SET category = $1, updated_at = CURRENT_TIMESTAMP WHERE category = $2`,
                [trimmedNewName, trimmedOldName]
            );

            await client.query('COMMIT');

            return res.status(200).json({
                success: true,
                message: `Successfully renamed category "${trimmedOldName}" to "${trimmedNewName}"`,
                transactionsUpdated: transactionsResult.rowCount,
                rulesUpdated: rulesResult.rowCount,
                budgetsUpdated: budgetsResult.rowCount
            });

        } else if (req.method === 'DELETE') {
            // DELETE logic
            const { deleteRules = true, deleteBudget = true } = req.body;
            const trimmedCategoryName = categoryName.trim();

            await client.query('BEGIN');

            const transactionsResult = await client.query(
                `UPDATE transactions SET category = NULL WHERE category = $1`,
                [trimmedCategoryName]
            );

            let rulesDeleted = 0;
            if (deleteRules) {
                const rulesResult = await client.query(
                    `DELETE FROM categorization_rules WHERE target_category = $1`,
                    [trimmedCategoryName]
                );
                rulesDeleted = rulesResult.rowCount;
            }

            let budgetDeleted = 0;
            if (deleteBudget) {
                const budgetResult = await client.query(
                    `DELETE FROM budgets WHERE category = $1`,
                    [trimmedCategoryName]
                );
                budgetDeleted = budgetResult.rowCount;
            }

            await client.query('COMMIT');

            return res.status(200).json({
                success: true,
                message: `Successfully deleted category "${trimmedCategoryName}"`,
                transactionsUncategorized: transactionsResult.rowCount,
                rulesDeleted,
                budgetDeleted
            });

        } else {
            res.setHeader('Allow', ['PATCH', 'DELETE']);
            return res.status(405).json({ error: `Method ${req.method} not allowed` });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error: error.message, stack: error.stack }, `Error in categories API for ${categoryName}`);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
}
