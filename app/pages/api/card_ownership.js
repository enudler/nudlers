import { createApiHandler } from "./utils/apiHandler";

const handler = createApiHandler({
  query: async (req) => {
    return {
      sql: `
        SELECT 
          co.id,
          co.vendor,
          co.account_number,
          co.credential_id,
          co.created_at,
          cv.card_vendor,
          cv.card_nickname
        FROM card_ownership co
        LEFT JOIN card_vendors cv ON co.account_number = cv.last4_digits
        ORDER BY co.credential_id, co.vendor, co.account_number
      `,
      params: []
    };
  }
});

export default handler;
