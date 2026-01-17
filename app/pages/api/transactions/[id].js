import { createApiHandler } from "../utils/apiHandler";

/**
 * Transactions CRUD by ID
 * 
 * GET /api/transactions/[id] - Get single transaction
 * PUT /api/transactions/[id] - Update transaction (category, price, etc.)
 * DELETE /api/transactions/[id] - Delete transaction
 * 
 * ID format: identifier|vendor (e.g., "txn123|visaCal")
 */
const handler = createApiHandler({
  validate: (req) => {
    if (!['GET', 'DELETE', 'PUT'].includes(req.method)) {
      return "Only GET, DELETE, and PUT methods are allowed";
    }
    if (!req.query.id) {
      return "ID parameter is required";
    }
    if (req.method === 'PUT' && !req.body?.price && !req.body?.category) {
      return "Either price or category is required for updates";
    }
  },
  query: async (req) => {
    const { id } = req.query;
    const [identifier, vendor] = id.split('|');

    if (!identifier || !vendor) {
      throw new Error('Invalid ID format. Expected: identifier|vendor');
    }

    if (req.method === 'GET') {
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
          WHERE identifier = $1 AND vendor = $2
        `,
        params: [identifier, vendor]
      };
    }

    if (req.method === 'DELETE') {
      return {
        sql: `
          DELETE FROM transactions 
          WHERE identifier = $1 AND vendor = $2
        `,
        params: [identifier, vendor]
      };
    }

    // PUT method for updating price and/or category
    const updates = [];
    const params = [identifier, vendor];
    let paramIndex = 3;

    if (req.body.price !== undefined) {
      updates.push(`price = $${paramIndex}`);
      params.push(req.body.price);
      paramIndex++;
    }

    if (req.body.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(req.body.category);
      paramIndex++;

      // Mark as manually edited
      updates.push(`category_source = 'cache'`);
    }

    return {
      sql: `
        UPDATE transactions 
        SET ${updates.join(', ')}
        WHERE identifier = $1 AND vendor = $2
      `,
      params: params
    };
  },
  transform: (result, req) => {
    if (req.method === 'GET') {
      return result.rows[0] || null;
    }
    return { success: true };
  }
});

export default handler;