import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * POST /api/categories/merge
 * Merge multiple source categories into a single target category.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: "Only POST method is allowed" });
    }

    const { sourceCategories, newCategoryName } = req.body;
    if (!sourceCategories || !Array.isArray(sourceCategories) || sourceCategories.length < 2) {
        return res.status(400).json({ error: "At least 2 source categories are required" });
    }
    if (!newCategoryName || typeof newCategoryName !== 'string' || newCategoryName.trim() === '') {
        return res.status(400).json({ error: "New category name is required" });
    }

    const client = await getDB();
    try {
        const trimmedNewName = newCategoryName.trim();
        await client.query('BEGIN');

        const updateResult = await client.query(
            `UPDATE transactions SET category = $1 WHERE category = ANY($2)`,
            [trimmedNewName, sourceCategories]
        );

        await client.query(
            `UPDATE categorization_rules SET target_category = $1, updated_at = CURRENT_TIMESTAMP WHERE target_category = ANY($2)`,
            [trimmedNewName, sourceCategories]
        );

        for (const source of sourceCategories) {
            if (source === trimmedNewName) continue;
            await client.query(
                `INSERT INTO category_mappings (source_category, target_category)
         VALUES ($1, $2)
         ON CONFLICT (source_category) DO UPDATE SET target_category = EXCLUDED.target_category`,
                [source, trimmedNewName]
            );
        }

        await client.query('COMMIT');
        res.status(200).json({
            success: true,
            message: `Successfully merged categories into "${trimmedNewName}"`,
            updatedRows: updateResult.rowCount
        });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error: error.message, stack: error.stack }, "Error merging categories");
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
}
