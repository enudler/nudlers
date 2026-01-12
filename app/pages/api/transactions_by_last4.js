import { createApiHandler } from "./utils/apiHandler";
import { decrypt } from "./utils/encryption";

const handler = createApiHandler({
  validate: (req) => {
    const { startDate, endDate, billingCycle, last4digits } = req.query;
    if (!billingCycle && (!startDate || !endDate)) return "Either billingCycle or startDate/endDate parameters are required";
    if (!last4digits) return "last4digits parameter is required";
  },
  query: async (req) => {
    const { startDate, endDate, billingCycle, last4digits } = req.query;

    // Build the date filter clause based on billingCycle or date range
    const useBillingCycle = !!billingCycle;

    // Join with card_ownership to get the correct credential for each card
    const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND t.account_number = co.account_number
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;

    // Handle 'Unknown' case - match null or empty account_number
    if (last4digits === 'Unknown') {
      if (useBillingCycle) {
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
            WHERE TO_CHAR(COALESCE(t.processed_date, t.date), 'YYYY-MM') = $1
            AND (t.account_number IS NULL OR t.account_number = '')
            ORDER BY t.identifier, t.vendor, t.date DESC
          `,
          params: [billingCycle]
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
          AND (t.account_number IS NULL OR t.account_number = '')
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [startDate, endDate]
      };
    }

    if (useBillingCycle) {
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
          WHERE TO_CHAR(COALESCE(t.processed_date, t.date), 'YYYY-MM') = $1
          AND RIGHT(t.account_number, 4) = $2
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [billingCycle, last4digits]
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
        AND RIGHT(t.account_number, 4) = $3
        ORDER BY t.identifier, t.vendor, t.date DESC
      `,
      params: [startDate, endDate, last4digits]
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
