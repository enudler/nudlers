import { createApiHandler } from "./utils/apiHandler";
import { decrypt } from "./utils/encryption";

const handler = createApiHandler({
  validate: (req) => {
    const { startDate, endDate, billingCycle, vendor } = req.query;
    if (!billingCycle && (!startDate || !endDate)) return "Either billingCycle or startDate/endDate parameters are required";
    if (!vendor) return "Vendor parameter is required";
  },
  query: async (req) => {
    const { startDate, endDate, billingCycle, vendor } = req.query;
    
    // Join with card_ownership to get the correct credential for each card
    const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND t.account_number = co.account_number
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;
    
    // If billingCycle is provided, filter by processed_date month
    if (billingCycle) {
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
          WHERE TO_CHAR(t.processed_date, 'YYYY-MM') = $1
          AND t.vendor = $2
          AND t.category != 'Bank' AND t.category != 'Income'
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [billingCycle, vendor]
      };
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
        WHERE t.date >= $1::date AND t.date <= $2::date
        AND t.vendor = $3
        AND t.category != 'Bank' AND t.category != 'Income'
        ORDER BY t.identifier, t.vendor, t.date DESC
      `,
      params: [startDate, endDate, vendor]
    };
  },
  transform: (result) => {
    if (result.rows) {
      return result.rows.map(row => ({
        ...row,
        card6_digits: row.card6_digits_encrypted ? decrypt(row.card6_digits_encrypted) : null,
        card6_digits_encrypted: undefined
      }));
    }
    return result;
  }
});

export default handler;
