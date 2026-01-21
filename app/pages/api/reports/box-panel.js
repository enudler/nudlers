import { createApiHandler } from "../utils/apiHandler";

const handler = createApiHandler({
  query: async () => ({
    sql: `
      WITH categories AS (
        SELECT count(distinct category) as count from transactions
      ),
      non_mapped AS (
        SELECT count(*) as count FROM transactions WHERE category IS NULL OR category = 'N/A'
      ),
      all_transactions AS (
        SELECT count(*) as count FROM transactions
      ),
      last_month AS (
        SELECT TO_CHAR(date, 'DD-MM-YYYY') as data FROM transactions ORDER BY date DESC LIMIT 1
      )
      SELECT 
        (SELECT count FROM categories) as categories_count,
        (SELECT count FROM non_mapped) as non_mapped_count,
        (SELECT count FROM all_transactions) as all_transactions_count,
        (SELECT data FROM last_month) as last_month_data
    `
  }),
  transform: (result) => {
    const row = result.rows[0];
    return {
      categories: parseInt(row.categories_count),
      nonMapped: parseInt(row.non_mapped_count),
      allTransactions: parseInt(row.all_transactions_count),
      lastMonth: row.last_month_data
    };
  }
});

export default handler;
