import { createApiHandler } from "./utils/apiHandler";
import { decrypt } from "./utils/encryption";

const handler = createApiHandler({
    validate: (req) => {
        const { q } = req.query;
        if (!q || q.length < 2) return "Search query must be at least 2 characters long";
    },
    query: async (req) => {
        const { q, startDate, endDate, billingCycle } = req.query;

        // Join with card_ownership to get the correct credential for each card
        const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND t.account_number = co.account_number
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;

        // Search pattern for ILIKE
        const searchPattern = `%${q}%`;
        const params = [searchPattern];
        let dateFilter = "";

        // Add date filtering logic
        if (billingCycle) {
            dateFilter = `AND TO_CHAR(t.processed_date, 'YYYY-MM') = $${params.length + 1}`;
            params.push(billingCycle);
        } else if (startDate && endDate) {
            dateFilter = `AND t.date >= $${params.length + 1}::date AND t.date <= $${params.length + 2}::date`;
            params.push(startDate, endDate);
        }

        return {
            sql: `
        SELECT DISTINCT ON (t.identifier, t.vendor)
          t.name,
          t.price,
          t.date,
          t.processed_date,
          t.category,
          t.identifier,
          t.vendor,
          t.installments_number,
          t.installments_total,
          t.original_amount,
          t.original_currency,
          t.charged_currency,
          t.account_number,
          vc.nickname as vendor_nickname,
          vc.card6_digits as card6_digits_encrypted
        FROM transactions t
        ${credentialJoin}
        WHERE (t.name ILIKE $1 
           OR t.vendor ILIKE $1 
           OR t.category ILIKE $1
           OR t.identifier ILIKE $1)
        ${dateFilter}
        ORDER BY t.identifier, t.vendor, t.date DESC
        LIMIT 100
      `,
            params: params
        };
    },
    transform: (result) => {
        if (result.rows) {
            return result.rows.map(row => ({
                ...row,
                card6_digits: row.card6_digits_encrypted ? decrypt(row.card6_digits_encrypted) : null,
                card6_digits_encrypted: undefined // Remove encrypted version
            }));
        }
        return result;
    }
});

export default handler;
