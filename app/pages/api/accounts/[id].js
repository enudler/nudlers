import { createApiHandler } from "../utils/apiHandler";

const handler = createApiHandler({
    validate: (req) => {
        if (!['PATCH'].includes(req.method)) {
            return "Only PATCH method is allowed";
        }
        if (!req.query.id) {
            return "ID parameter is required";
        }
    },
    query: async (req) => {
        const { id } = req.query;

        // PATCH method - update card_ownership (supports is_hidden toggle)
        if (req.method === 'PATCH') {
            const { is_hidden } = req.body;

            if (typeof is_hidden !== 'boolean') {
                throw new Error('is_hidden must be a boolean');
            }

            return {
                sql: `
          UPDATE card_ownership 
          SET is_hidden = $2
          WHERE id = $1
          RETURNING *
        `,
                params: [id, is_hidden]
            };
        }
    },
    transform: (result) => {
        if (result.rows && result.rows[0]) {
            const row = result.rows[0];
            return {
                id: row.id,
                vendor: row.vendor,
                account_number: row.account_number,
                is_hidden: row.is_hidden
            };
        }
        return { success: true };
    }
});

export default handler;
