import { createApiHandler } from "../utils/apiHandler";
import logger from '../../../utils/logger.js';

const handler = createApiHandler({
    validate: (req) => {
        if (req.method !== 'POST') {
            return "Only POST method is allowed";
        }
    },
    query: async () => {
        return {
            sql: 'DELETE FROM transactions',
            params: []
        };
    },
    transform: (result) => {
        logger.info({ deletedCount: result.rowCount }, 'Successfully deleted all transactions');
        return {
            success: true,
            deletedCount: result.rowCount,
            message: `Successfully deleted ${result.rowCount} transactions`
        };
    }
});

export default handler;
