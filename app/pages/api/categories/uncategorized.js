import { createApiHandler } from "../utils/apiHandler";

/**
 * GET /api/categories/uncategorized
 * Get unique descriptions from transactions that don't have a category.
 */
const handler = createApiHandler({
    query: async () => ({
        sql: `
      SELECT 
        name AS description, 
        COUNT(*) AS count,
        SUM(ABS(price)) AS total_amount
      FROM transactions
      WHERE category IS NULL 
         OR category = '' 
         OR category = 'N/A'
      GROUP BY name
      ORDER BY count DESC, total_amount DESC
    `
    }),
    transform: (result) => result.rows.map((row) => ({
        description: row.description,
        count: parseInt(row.count, 10),
        totalAmount: parseFloat(row.total_amount || 0)
    }))
});

export default handler;
