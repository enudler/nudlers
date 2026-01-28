import { createApiHandler } from "../../utils/apiHandler";

/**
 * Chat Session by ID
 *
 * GET /api/chat/history/[id] - Get a specific chat session
 * DELETE /api/chat/history/[id] - Delete a chat session
 */
const handler = createApiHandler({
    validate: (req) => {
        if (!['GET', 'DELETE'].includes(req.method)) {
            return "Only GET and DELETE methods are allowed";
        }
        if (!req.query.id) {
            return "Session ID is required";
        }
    },
    query: async (req) => {
        const { id } = req.query;

        if (req.method === 'GET') {
            return {
                sql: `
          SELECT id, title, created_at, updated_at
          FROM chat_sessions
          WHERE id = $1
        `,
                params: [id]
            };
        }

        if (req.method === 'DELETE') {
            return {
                sql: `DELETE FROM chat_sessions WHERE id = $1 RETURNING id`,
                params: [id]
            };
        }
    },
    transform: (result, req) => {
        if (req.method === 'GET') {
            if (result.rows.length === 0) {
                return { error: 'Session not found', status: 404 };
            }
            return result.rows[0];
        }
        if (req.method === 'DELETE') {
            if (result.rows.length === 0) {
                return { error: 'Session not found', status: 404 };
            }
            return { success: true };
        }
    }
});

export default handler;
