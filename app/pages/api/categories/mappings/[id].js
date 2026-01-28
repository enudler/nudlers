import { createApiHandler } from "../../utils/apiHandler";

/**
 * Category Mappings by ID
 *
 * GET /api/categories/mappings/[id] - Get a single category mapping
 * DELETE /api/categories/mappings/[id] - Delete a category mapping
 */
const handler = createApiHandler({
  validate: (req) => {
    if (!['GET', 'DELETE'].includes(req.method)) {
      return "Only GET and DELETE methods are allowed";
    }
    if (!req.query.id) {
      return "ID parameter is required";
    }
  },
  query: async (req) => {
    const { id } = req.query;

    if (req.method === 'GET') {
      return {
        sql: `
          SELECT id, source_category, target_category, created_at
          FROM category_mappings
          WHERE id = $1
        `,
        params: [id]
      };
    }

    if (req.method === 'DELETE') {
      return {
        sql: `
          DELETE FROM category_mappings
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
        return { error: 'Mapping not found', status: 404 };
      }
      return result.rows[0];
    }
    if (req.method === 'DELETE') {
      if (result.rows.length === 0) {
        return { error: 'Mapping not found', status: 404 };
      }
      return { success: true };
    }
  }
});

export default handler;
