import { createApiHandler } from "../../utils/apiHandler";

/**
 * Categories Rules by ID
 *
 * GET /api/categories/rules/[id] - Get a single categorization rule
 * PUT /api/categories/rules/[id] - Update a categorization rule
 * DELETE /api/categories/rules/[id] - Delete a categorization rule
 */
const handler = createApiHandler({
  validate: (req) => {
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
      return "Only GET, PUT, and DELETE methods are allowed";
    }
    if (!req.query.id) {
      return "ID parameter is required";
    }

    if (req.method === 'PUT') {
      const { name_pattern, target_category } = req.body;
      if (!name_pattern || !target_category) {
        return "name_pattern and target_category are required";
      }
    }
  },
  query: async (req) => {
    const { id } = req.query;

    if (req.method === 'GET') {
      return {
        sql: `
          SELECT id, name_pattern, target_category, is_active, created_at, updated_at
          FROM categorization_rules
          WHERE id = $1
        `,
        params: [id]
      };
    }

    if (req.method === 'PUT') {
      const { name_pattern, target_category, is_active } = req.body;
      return {
        sql: `
          UPDATE categorization_rules
          SET name_pattern = $2, target_category = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, name_pattern, target_category, is_active, created_at, updated_at
        `,
        params: [id, name_pattern, target_category, is_active !== false]
      };
    }

    if (req.method === 'DELETE') {
      return {
        sql: `
          DELETE FROM categorization_rules
          WHERE id = $1
          RETURNING id
        `,
        params: [id]
      };
    }
  },
  transform: (result, req) => {
    if (req.method === 'GET') {
      if (result.rows.length === 0) {
        return { error: 'Rule not found', status: 404 };
      }
      return result.rows[0];
    }
    if (req.method === 'PUT') {
      if (result.rows.length === 0) {
        return { error: 'Rule not found', status: 404 };
      }
      return result.rows[0];
    }
    if (req.method === 'DELETE') {
      if (result.rows.length === 0) {
        return { error: 'Rule not found', status: 404 };
      }
      return { success: true };
    }
  }
});

export default handler;
