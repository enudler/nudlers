import { createApiHandler } from "./utils/apiHandler";
import { decrypt } from "./utils/encryption";

const handler = createApiHandler({
  validate: (req) => {
    const { month, startDate, endDate, category, all, billingCycle } = req.query;
    // Support legacy month parameter, date range parameters, and billingCycle
    if (!month && (!startDate || !endDate) && !billingCycle) {
      return "Either month, billingCycle, or both startDate and endDate parameters are required";
    }
    if (!category && all !== "true") return "Either category or all=true is required";
  },
  query: async (req) => {
    const { month, startDate, endDate, category, all, billingCycle } = req.query;
    
    // Use date range if provided, otherwise fall back to month
    const useDateRange = startDate && endDate;
    
    // Join with card_ownership to get the correct credential for each card
    // This prevents duplicate rows when multiple credentials exist for the same vendor
    const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND t.account_number = co.account_number
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;
    
    if (all === "true") {
      // If billingCycle is provided, filter by processed_date month
      if (billingCycle) {
        return {
          sql: `
            SELECT DISTINCT ON (t.identifier, t.vendor)
              t.name,
              t.price,
              t.date,
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
            ORDER BY t.identifier, t.vendor, t.date DESC
          `,
          params: [billingCycle]
        };
      }
      if (useDateRange) {
        return {
          sql: `
            SELECT DISTINCT ON (t.identifier, t.vendor)
              t.name,
              t.price,
              t.date,
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
            ORDER BY t.identifier, t.vendor, t.date DESC
          `,
          params: [startDate, endDate]
        };
      }
      return {
        sql: `
          SELECT DISTINCT ON (t.identifier, t.vendor)
            t.name,
            t.price,
            t.date,
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
          WHERE TO_CHAR(t.date, 'YYYY-MM') = $1
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [month]
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
          AND t.category = $2
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [billingCycle, category]
      };
    }
    
    if (useDateRange) {
      return {
        sql: `
          SELECT DISTINCT ON (t.identifier, t.vendor)
            t.name,
            t.price,
            t.date,
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
          AND t.category = $3
          ORDER BY t.identifier, t.vendor, t.date DESC
        `,
        params: [startDate, endDate, category]
      };
    }
    
    return {
      sql: `
        SELECT DISTINCT ON (t.identifier, t.vendor)
          t.name,
          t.price,
          t.date,
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
        WHERE TO_CHAR(t.date, 'YYYY-MM') = $1 
        AND t.category = $2
        ORDER BY t.identifier, t.vendor, t.date DESC
      `,
      params: [month, category]
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
