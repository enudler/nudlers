import { createApiHandler } from "../utils/apiHandler";

const handler = createApiHandler({
  query: async () => ({
    sql: `
      SELECT DISTINCT 
        t.vendor,
        vc.nickname as vendor_nickname,
        CASE 
          WHEN t.vendor LIKE '%bank%' OR t.vendor LIKE '%hapoalim%' OR t.vendor LIKE '%leumi%' 
               OR t.vendor LIKE '%discount%' OR t.vendor LIKE '%mizrahi%'
          THEN 'bank'
          ELSE 'card'
        END as vendor_type
      FROM transactions t
      LEFT JOIN (
        SELECT DISTINCT ON (vendor) vendor, nickname
        FROM vendor_credentials
        WHERE is_active = true
        ORDER BY vendor, id
      ) vc ON t.vendor = vc.vendor
      ORDER BY vendor_type, t.vendor
    `,
  }),
});

export default handler;
