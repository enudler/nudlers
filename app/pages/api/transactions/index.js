import { createApiHandler } from "../utils/apiHandler";

/**
 * GET /api/transactions
 * List transactions with filtering options
 * 
 * Query params:
 * - startDate: Start date filter (YYYY-MM-DD)
 * - endDate: End date filter (YYYY-MM-DD)
 * - vendor: Vendor filter
 * - accountNumber: Account number filter
 * - category: Category filter
 * - transactionType: 'all' | 'bank' | 'credit_card' (default: 'all')
 * - limit: Maximum number of results (default 100)
 * - offset: Pagination offset
 */
const handler = createApiHandler({
    validate: (req) => {
        if (req.method !== 'GET') {
            return "Only GET method is allowed";
        }

        const { transactionType } = req.query;
        if (transactionType && !['all', 'bank', 'credit_card'].includes(transactionType)) {
            return "transactionType must be 'all', 'bank', or 'credit_card'";
        }
    },
    query: async (req) => {
        const {
            startDate,
            endDate,
            vendor,
            accountNumber,
            category,
            transactionType = 'all',
            limit = 100,
            offset = 0
        } = req.query;

        const params = [];
        let paramIndex = 1;
        const conditions = [];

        // Filter by transaction type
        if (transactionType && transactionType !== 'all') {
            conditions.push(`transaction_type = $${paramIndex}`);
            params.push(transactionType);
            paramIndex++;
        }

        if (startDate) {
            conditions.push(`date >= $${paramIndex}::date`);
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            conditions.push(`date <= $${paramIndex}::date`);
            params.push(endDate);
            paramIndex++;
        }

        if (vendor) {
            conditions.push(`vendor = $${paramIndex}`);
            params.push(vendor);
            paramIndex++;
        }

        if (accountNumber) {
            conditions.push(`account_number = $${paramIndex}`);
            params.push(accountNumber);
            paramIndex++;
        }

        if (category) {
            conditions.push(`category = $${paramIndex}`);
            params.push(category);
            paramIndex++;
        }

        const whereClause = conditions.length > 0
            ? 'WHERE ' + conditions.join(' AND ')
            : '';

        // Add limit and offset
        const limitParam = `$${paramIndex}`;
        params.push(parseInt(limit) || 100);
        paramIndex++;

        const offsetParam = `$${paramIndex}`;
        params.push(parseInt(offset) || 0);

        return {
            sql: `
        SELECT 
          identifier,
          vendor,
          date,
          name,
          price,
          category,
          type,
          processed_date,
          original_amount,
          original_currency,
          charged_currency,
          memo,
          status,
          installments_number,
          installments_total,
          account_number,
          category_source,
          rule_matched,
          transaction_type
        FROM transactions
        ${whereClause}
        ORDER BY date DESC, name
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
            params
        };
    }
});

export default handler;
