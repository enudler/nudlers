import { createApiHandler } from "../../utils/apiHandler";

const handler = createApiHandler({
  query: async (req) => {
    return {
      sql: `
        SELECT 
          co.id,
          co.vendor,
          co.account_number,
          co.credential_id,
          co.linked_bank_account_id,
          co.custom_bank_account_number,
          co.custom_bank_account_nickname,
          co.created_at,
          cv.card_vendor,
          cv.card_nickname,
          ba.id as bank_account_id,
          ba.nickname as bank_account_nickname,
          ba.bank_account_number,
          ba.vendor as bank_account_vendor
        FROM card_ownership co
        LEFT JOIN card_vendors cv ON co.account_number = cv.last4_digits
        LEFT JOIN vendor_credentials ba ON co.linked_bank_account_id = ba.id
        ORDER BY co.credential_id, co.vendor, co.account_number
      `,
      params: []
    };
  },
});

export default handler;
