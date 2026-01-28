import { createApiHandler } from "../../utils/apiHandler";

/**
 * Chat Sessions Collection (History)
 *
 * GET /api/chat/history - List all chat sessions
 *
 * For individual session operations (GET/DELETE by ID), use /api/chat/history/{id}
 */
const handler = createApiHandler({
    validate: (req) => {
        if (!['GET'].includes(req.method)) {
            return "Only GET method is allowed. Use /api/chat/history/{id} for DELETE";
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
    },
    transform: (result, req) => {
        if (req.method === 'GET') return result.rows;
    }
});

export default handler;
