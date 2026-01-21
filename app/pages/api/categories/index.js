import { createApiHandler } from "../utils/apiHandler";

const handler = createApiHandler({
    query: async () => ({
        sql: `
      SELECT category AS name, COUNT(*) AS count
      FROM transactions
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
    `
    }),
    transform: (result) => result.rows.map((row) => row.name)
});

export default handler;
