import { createApiHandler } from "../../utils/apiHandler";

/**
 * Categorization Rules Collection
 *
 * GET /api/categories/rules - List all categorization rules
 * POST /api/categories/rules - Create a new categorization rule
 *
 * For individual rule operations (GET/PUT/DELETE by ID), use /api/categories/rules/{id}
 */
const handler = createApiHandler({
  validate: (req) => {
    if (!['GET', 'POST'].includes(req.method)) {
      return "Only GET and POST methods are allowed. Use /api/categories/rules/{id} for PUT/DELETE";
    }

    if (req.method === 'POST') {
      const { name_pattern, target_category } = req.body;
      if (!name_pattern || !target_category) {
        return "name_pattern and target_category are required";
      }
    }
  },
  query: async (req) => {
    if (req.method === 'GET') {
      return {
        sql: `
          SELECT id, name_pattern, target_category, is_active, created_at, updated_at
          FROM categorization_rules
          ORDER BY created_at DESC
        `,
        params: []
      };
    }

    if (req.method === 'POST') {
      const { name_pattern, target_category } = req.body;
      return {
        sql: `
          INSERT INTO categorization_rules (name_pattern, target_category)
          VALUES ($1, $2)
          RETURNING id, name_pattern, target_category, is_active, created_at, updated_at
        `,
        params: [name_pattern, target_category]
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
