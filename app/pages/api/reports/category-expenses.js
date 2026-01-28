import { createApiHandler } from "../utils/apiHandler";
import { decrypt } from "../utils/encryption";
import { getDB } from "../db";
import { getBillingCycleSql } from "../../../utils/transaction_logic";

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
    const {
      month,
      startDate,
      endDate,
      category,
      all,
      billingCycle,
      sortBy = 'date',
      sortOrder = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    const limitVal = parseInt(limit);
    const offsetVal = parseInt(offset);

    // Use date range if provided, otherwise fall back to month
    const useDateRange = startDate && endDate;

    // Join with card_ownership to get the correct credential for each card
    // This prevents duplicate rows when multiple credentials exist for the same vendor
    const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND t.account_number = co.account_number
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;

    // Sorting
    const validSortColumns = ['name', 'price', 'date', 'category', 'account_number', 'vendor'];
    const sortCol = validSortColumns.includes(sortBy) ? sortBy : 'date';
    const sortDir = sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderByClause = `ORDER BY t.${sortCol} ${sortDir}, t.identifier, t.vendor`;


    // If billingCycle is provided, use consistent Logic
    let billingStartDay = 10;
    let effectiveMonthSql = null;

    if (billingCycle) {
      // Import settings
      const client = await getDB();
      try {
        const settingsResult = await client.query("SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");
        if (settingsResult.rows.length > 0) {
          const val = parseInt(settingsResult.rows[0].value);
          if (!isNaN(val)) {
            billingStartDay = val;
          }
        }
      } finally {
        client.release();
      }
      // Use table alias 't' to avoid ambiguity and ensure correct column reference
      effectiveMonthSql = getBillingCycleSql(billingStartDay, 't.date', 't.processed_date');
    }

    if (all === "true") {
      // If billingCycle is provided, filter by effective billing month
      if (billingCycle) {
        return {
          sql: `
            SELECT 
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
            WHERE (${effectiveMonthSql}) = $1
            ${orderByClause}
            LIMIT $2 OFFSET $3
          `,
          params: [billingCycle, limitVal, offsetVal]
        };
      }
      if (useDateRange) {
        return {
          sql: `
            SELECT 
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
            ${orderByClause}
            LIMIT $3 OFFSET $4
          `,
          params: [startDate, endDate, limitVal, offsetVal]
        };
      }
      return {
        sql: `
          SELECT 
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
          ${orderByClause}
          LIMIT $2 OFFSET $3
        `,
        params: [month, limitVal, offsetVal]
      };
    }

    // If billingCycle is provided, filter by effective billing month
    if (billingCycle) {
      return {
        sql: `
          SELECT 
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
          WHERE (${effectiveMonthSql}) = $1
          AND t.category = $2
          ${orderByClause}
          LIMIT $3 OFFSET $4
        `,
        params: [billingCycle, category, limitVal, offsetVal]
      };
    }

    if (useDateRange) {
      return {
        sql: `
          SELECT 
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
          ${orderByClause}
          LIMIT $4 OFFSET $5
        `,
        params: [startDate, endDate, category, limitVal, offsetVal]
      };
    }

    return {
      sql: `
        SELECT 
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
        ${orderByClause}
        LIMIT $3 OFFSET $4
      `,
      params: [month, category, limitVal, offsetVal]
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
