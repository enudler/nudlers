import { createApiHandler } from "../utils/apiHandler";

const handler = createApiHandler({
    validate: (req) => {
        if (req.method !== 'GET') {
            return "Only GET method is allowed";
        }
        const { sessionId } = req.query;
        if (!sessionId) return "sessionId is required";
    },
    query: async (req) => {
        const { sessionId } = req.query;
        return {
            sql: `
        SELECT id, role, content, timestamp
        FROM chat_messages
        WHERE session_id = $1
        ORDER BY id ASC
      `,
            params: [sessionId]
        };
    },
    transform: (result) => result.rows
});

export default handler;
