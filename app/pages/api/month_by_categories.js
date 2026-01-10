import { createApiHandler } from "./utils/apiHandler";

const handler = createApiHandler({
  validate: (req) => {
    const { month, startDate, endDate, billingCycle } = req.query;
    // Support legacy month parameter, date range parameters, and billingCycle
    if (!month && (!startDate || !endDate) && !billingCycle) {
      return "Either month, billingCycle, or both startDate and endDate parameters are required";
    }
  },
  query: async (req) => {
    const { month, startDate, endDate, billingCycle } = req.query;
    
    // If billingCycle is provided (e.g., "2026-01"), filter by processed_date month
    // This is more accurate for credit card billing cycles
    // Use DISTINCT ON to prevent counting duplicates
    if (billingCycle) {
      return {
        sql: `
          WITH unique_transactions AS (
            SELECT DISTINCT ON (identifier, vendor)
              category,
              price
            FROM transactions
            WHERE TO_CHAR(processed_date, 'YYYY-MM') = $1
            AND category != 'Bank'
            ORDER BY identifier, vendor, date DESC
          )
          SELECT 
            category as name, 
            COUNT(*) AS transaction_count, 
            ABS(ROUND(SUM(price))) AS value
          FROM unique_transactions
          GROUP BY category
        `,
        params: [billingCycle]
      };
    }
    
    // If date range is provided, use it; otherwise fall back to month
    // Use DISTINCT ON to prevent counting duplicates
    if (startDate && endDate) {
      return {
        sql: `
          WITH unique_transactions AS (
            SELECT DISTINCT ON (identifier, vendor)
              category,
              price
            FROM transactions
            WHERE date >= $1::date AND date <= $2::date
            AND category != 'Bank'
            ORDER BY identifier, vendor, date DESC
          )
          SELECT 
            category as name, 
            COUNT(*) AS transaction_count, 
            ABS(ROUND(SUM(price))) AS value
          FROM unique_transactions
          GROUP BY category
        `,
        params: [startDate, endDate]
      };
    }
    
    return {
      sql: `
        WITH unique_transactions AS (
          SELECT DISTINCT ON (identifier, vendor)
            category,
            price
          FROM transactions
          WHERE TO_CHAR(date, 'YYYY-MM') = $1 
          AND category != 'Bank'
          ORDER BY identifier, vendor, date DESC
        )
        SELECT 
          category as name, 
          COUNT(*) AS transaction_count, 
          ABS(ROUND(SUM(price))) AS value
        FROM unique_transactions
        GROUP BY category
      `,
      params: [month]
    };
  }
});

export default handler;
