import { createApiHandler } from "../utils/apiHandler";

const handler = createApiHandler({
    validate: (req) => {
        if (!['GET', 'DELETE'].includes(req.method)) {
            return "Only GET and DELETE methods are allowed";
        }
        if (req.method === 'DELETE') {
            const { id } = req.body;
            if (!id) return "Session ID is required for deletion";
        }
    },
    query: async (req) => {
        if (req.method === 'GET') {
            return {
                sql: `
          SELECT id, title, created_at, updated_at
          FROM chat_sessions
          ORDER BY updated_at DESC
        `,
                params: []
            };
        }
        if (req.method === 'DELETE') {
            const { id } = req.body;
            return {
                sql: `DELETE FROM chat_sessions WHERE id = $1`,
                params: [id]
            };
        }
    },
    transform: (result, req) => {
        if (req.method === 'GET') return result.rows;
        return { success: true };
    }
});

export default handler;
