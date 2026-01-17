import { createApiHandler } from "./utils/apiHandler";
import { getDB } from "./db";
import { getBillingCycleSql } from "../../utils/transaction_logic";

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

    // If billingCycle is provided (e.g., "2026-01"), filter by effective billing month
    // Use consistent logic from transaction_logic.js
    // Use DISTINCT ON to prevent counting duplicates
    if (billingCycle) {
      // We need to fetch the billing start day setting first
      // Since we are inside the query builder which receives { req, client? }?
      // Actually createApiHandler's query function receives (req). It doesn't receive client directly usually unless designed so.
      // Looking at apiHandler implementation (not visible but usually it executes the returned SQL). 
      // If `query` is async, we can get a client manually or if the handler supports it.
      // Ideally, the handler should provide the client. 
      // Assuming I can't easily get the client here without importing getDB, I will import getDB.


      const client = await getDB();
      let billingStartDay = 10;
      try {
        const settingsResult = await client.query("SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");
        if (settingsResult.rows.length > 0) {
          billingStartDay = parseInt(settingsResult.rows[0].value);
        }
      } finally {
        client.release();
      }

      const effectiveMonthSql = getBillingCycleSql(billingStartDay, 'date', 'processed_date');

      return {
        sql: `
          WITH unique_transactions AS (
            SELECT DISTINCT ON (identifier, vendor)
              COALESCE(NULLIF(category, ''), 'Uncategorized') as category,
              price
            FROM transactions
            WHERE (${effectiveMonthSql}) = $1
            AND category != 'Bank'
            AND category != 'Income'
            ORDER BY identifier, vendor, date DESC
          )
          SELECT 
            category as name, 
            COUNT(*) AS transaction_count, 
            ABS(ROUND(SUM(price))) AS value
          FROM unique_transactions
          GROUP BY category
          ORDER BY value DESC
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
              COALESCE(NULLIF(category, ''), 'Uncategorized') as category,
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
          ORDER BY value DESC
        `,
        params: [startDate, endDate]
      };
    }

    return {
      sql: `
        WITH unique_transactions AS (
          SELECT DISTINCT ON (identifier, vendor)
            COALESCE(NULLIF(category, ''), 'Uncategorized') as category,
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
        ORDER BY value DESC
      `,
      params: [month]
    };
  }
});

export default handler;
