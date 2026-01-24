import { createApiHandler } from "../utils/apiHandler";
import { getDB } from "../db";
import { getBillingCycleSql } from "../../../utils/transaction_logic";

// Generate the next N months from current date (including current month)
const getAdvanceMonths = (count) => {
  const months = [];
  const now = new Date();

  for (let i = 0; i <= count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }

  return months;
};

const handler = createApiHandler({
  query: async () => {
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

    const cycleSql = getBillingCycleSql(billingStartDay, 'date', 'processed_date');
    return {
      sql: `SELECT ARRAY_AGG(DISTINCT ${cycleSql}) as months FROM transactions;`,
    };
  },
  transform: (result) => {
    const transactionMonths = result.rows[0]?.months || [];
    const advanceMonths = getAdvanceMonths(3); // Current month + 3 months ahead

    // Combine and deduplicate, then sort descending
    const allMonths = [...new Set([...transactionMonths, ...advanceMonths])];
    return allMonths.sort((a, b) => b.localeCompare(a));
  },
});

export default handler;
