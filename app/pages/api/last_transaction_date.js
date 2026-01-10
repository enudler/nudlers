import { createApiHandler } from "./utils/apiHandler";

const handler = createApiHandler({
  validate: (req) => {
    if (req.method !== 'GET') {
      return 'Method not allowed';
    }
    const { vendor } = req.query;
    if (!vendor) {
      return 'Vendor is required';
    }
    return null;
  },
  query: async (req) => {
    const { vendor, credentialId } = req.query;
    
    // Get the most recent transaction date for this vendor
    // If credentialId is provided, we could filter by account_number 
    // associated with that credential, but for simplicity we use vendor only
    return {
      sql: `
        SELECT MAX(date) as last_date
        FROM transactions
        WHERE vendor = $1
      `,
      params: [vendor]
    };
  },
  transform: (result) => {
    const lastDate = result.rows?.[0]?.last_date;
    return {
      lastDate: lastDate ? new Date(lastDate).toISOString() : null
    };
  }
});

export default handler;
