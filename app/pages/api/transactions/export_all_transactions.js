import { createApiHandler } from "../utils/apiHandler";
import logger from '../../../utils/logger.js';

const handler = createApiHandler({
    validate: (req) => {
        if (req.method !== 'GET') {
            return "Only GET method is allowed";
        }
    },
    query: async () => {
        return {
            sql: `
                SELECT 
                    identifier,
                    vendor,
                    name,
                    price,
                    date,
                    processed_date,
                    category,
                    account_number,
                    memo,
                    type,
                    status,
                    installments_number,
                    installments_total,
                    original_amount,
                    original_currency,
                    charged_currency,
                    transaction_type,
                    category_source,
                    rule_matched
                FROM transactions
                ORDER BY date DESC
            `,
            params: []
        };
    },
    transform: (result) => {
        logger.info({ count: result.rows.length }, 'Exported all transactions for backup');
        return {
            success: true,
            count: result.rows.length,
            transactions: result.rows,
            exportedAt: new Date().toISOString()
        };
    }
});

export default handler;
