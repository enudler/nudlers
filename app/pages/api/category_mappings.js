import { createApiHandler } from "./utils/apiHandler";

const handler = createApiHandler({
    validate: (req) => {
        if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
            return "Only GET, POST, and DELETE methods are allowed";
        }

        if (req.method === 'POST') {
            const { source_category, target_category } = req.body;
            if (!source_category || !target_category) {
                return "source_category and target_category are required";
            }
        }

        if (req.method === 'DELETE') {
            const { id } = req.body;
            if (!id) {
                return "id is required";
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

        if (req.method === 'DELETE') {
            const { id } = req.body;
            return {
                sql: `
          DELETE FROM category_mappings 
          WHERE id = $1
        `,
                params: [id]
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
        return { success: true };
    }
});

export default handler; 
