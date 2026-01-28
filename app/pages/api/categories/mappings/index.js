import { createApiHandler } from "../../utils/apiHandler";

/**
 * Category Mappings Collection
 *
 * GET /api/categories/mappings - List all category mappings
 * POST /api/categories/mappings - Create or update a category mapping
 *
 * For individual mapping operations (GET/DELETE by ID), use /api/categories/mappings/{id}
 */
const handler = createApiHandler({
    validate: (req) => {
        if (!['GET', 'POST'].includes(req.method)) {
            return "Only GET and POST methods are allowed. Use /api/categories/mappings/{id} for DELETE";
        }

        if (req.method === 'POST') {
            const { source_category, target_category } = req.body;
            if (!source_category || !target_category) {
                return "source_category and target_category are required";
            }
        }
    },
    query: async (req) => {
        if (req.method === 'GET') {
            return {
                sql: `
          SELECT id, source_category, target_category, created_at
          FROM category_mappings
          ORDER BY created_at DESC
        `,
                params: []
            };
        }

        if (req.method === 'POST') {
            const { source_category, target_category } = req.body;
            return {
                sql: `
          INSERT INTO category_mappings (source_category, target_category)
          VALUES ($1, $2)
          ON CONFLICT (source_category) DO UPDATE
          SET target_category = EXCLUDED.target_category
          RETURNING id, source_category, target_category, created_at
        `,
                params: [source_category, target_category]
            };
        }
    },
    transform: (result, req) => {
        if (req.method === 'GET') {
            return result.rows;
        }
        if (req.method === 'POST') {
            return result.rows[0];
        }
    }
});

export default handler;
