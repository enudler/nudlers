import { createApiHandler } from "./utils/apiHandler";
import { decrypt } from "./utils/encryption";

const handler = createApiHandler({
  validate: (req) => {
    const { startDate, endDate, billingCycle, description, uncategorizedOnly } = req.query;
    // Allow uncategorizedOnly mode without date filters
    if (uncategorizedOnly === 'true') {
      if (!description) return "Description parameter is required";
      return; // Valid
    }
    if (!billingCycle && (!startDate || !endDate)) return "Either billingCycle or startDate/endDate parameters are required";
    if (!description) return "Description parameter is required";
  },
  query: async (req) => {
    const { startDate, endDate, billingCycle, description, uncategorizedOnly } = req.query;
    
    // Join with card_ownership to get the correct credential for each card
    const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND t.account_number = co.account_number
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;
    
    // If uncategorizedOnly is true, fetch all uncategorized transactions for the description
    if (uncategorizedOnly === 'true') {
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
          WHERE t.name = $1
          AND (t.category IS NULL OR t.category = '' OR t.category = 'N/A')
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [description]
      };
    }
    
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
          AND t.name = $2
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [billingCycle, description]
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
        AND t.name = $3
        ORDER BY t.identifier, t.vendor, t.date DESC
      `,
      params: [startDate, endDate, description]
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
