import { createApiHandler } from "../utils/apiHandler";

const handler = createApiHandler({
  validate: (req) => {
    if (req.method !== 'DELETE') {
      return "Only DELETE method is allowed";
    }
    const { name, date, price, category } = req.body;
    if (!name || !date || price === undefined || !category) {
      return "Name, date, price, and category are required";
    }
  },
  query: async (req) => {
    const { name, date, price, category } = req.body;
    
    return {
      sql: `
        DELETE FROM transactions 
        WHERE name = $1 
        AND date = $2 
        AND price = $3 
        AND category = $4
      `,
      params: [name, new Date(date), price, category]
    };
  },
  transform: (_) => {
    return { success: true };
  }
});

export default handler; 