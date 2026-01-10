import { createApiHandler } from "./utils/apiHandler";

const handler = createApiHandler({
  validate: (req) => {
    if (req.method !== 'POST') {
      return "Only POST method is allowed";
    }
    const { name, amount, date, type, category } = req.body;
    if (!name || amount === undefined || !date || !type) {
      return "Name, amount, date, and type are required";
    }
    if (type === 'expense' && !category) {
      return "Category is required for expense transactions";
    }
  },
  query: async (req) => {
    const { name, amount, date, type, category } = req.body;
    
    // Generate a unique identifier for the transaction
    const identifier = `manual_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine vendor and category based on transaction type
    const vendor = type === 'income' ? 'manual_income' : 'manual_expense';
    const transactionCategory = type === 'income' ? 'Bank' : category;
    
    return {
      sql: `
        INSERT INTO transactions (
          identifier,
          vendor,
          date,
          name,
          price,
          category,
          type,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      params: [
        identifier,
        vendor,
        new Date(date),
        name,
        Math.abs(amount), // Store positive amount for both income and expenses
        transactionCategory,
        type,
        'completed'
      ]
    };
  },
  transform: (_) => {
    return { success: true };
  }
});

export default handler; 