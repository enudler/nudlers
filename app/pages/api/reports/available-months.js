import { createApiHandler } from "../utils/apiHandler";

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
  query: async () => ({
    sql: "SELECT ARRAY_AGG(DISTINCT TO_CHAR(date, 'YYYY-MM')) FROM transactions;",
  }),
  transform: (result) => {
    const transactionMonths = result.rows[0]?.array_agg || [];
    const advanceMonths = getAdvanceMonths(3); // Current month + 3 months ahead
    
    // Combine and deduplicate, then sort descending
    const allMonths = [...new Set([...transactionMonths, ...advanceMonths])];
    return allMonths.sort((a, b) => b.localeCompare(a));
  },
});

export default handler;
