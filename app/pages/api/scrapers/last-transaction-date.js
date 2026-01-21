import { createApiHandler } from "../utils/apiHandler";

/**
 * GET /api/scrapers/last-transaction-date
 * Returns the most recent transaction date for a given vendor.
 * Used by UI to suggest a start date for scraping.
 */
const handler = createApiHandler({
    validate: (req) => {
        if (!req.query.vendor) {
            return "Vendor is required";
        }
    },
    query: async (req) => {
        const { vendor } = req.query;
        return {
            sql: `
        SELECT MAX(date) as "lastDate"
        FROM transactions
        WHERE vendor = $1
      `,
            params: [vendor]
        };
    },
    transform: (result) => {
        const lastDate = result.rows[0]?.lastDate;
        return { lastDate: lastDate || null };
    }
});

export default handler;
