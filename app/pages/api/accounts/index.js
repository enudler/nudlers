import { createApiHandler } from "../utils/apiHandler";
import { BANK_VENDORS } from "../../../utils/constants.js";

const handler = createApiHandler({
    query: async () => {
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
          co.balance,
          co.balance_updated_at,
          vc.nickname as credential_nickname,
          vc.vendor as credential_vendor,
          cv.card_nickname as mapped_card_nickname,
          cv.card_vendor as mapped_card_vendor
        FROM card_ownership co
        LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
        LEFT JOIN card_vendors cv ON RIGHT(co.account_number, 4) = cv.last4_digits
        ORDER BY co.vendor, co.account_number
      `
        };
    },
    transform: (result) => {
        return result.rows.map(row => ({
            id: row.id,
            vendor: row.vendor,
            account_number: row.account_number,
            last4: row.account_number.slice(-4),
            balance: row.balance,
            balance_updated_at: row.balance_updated_at,
            nickname: row.custom_bank_account_nickname || row.mapped_card_nickname || row.credential_nickname || `${row.vendor} •••• ${row.account_number.slice(-4)}`,
            credential: {
                id: row.credential_id,
                vendor: row.credential_vendor,
                nickname: row.credential_nickname
            },
            linked_bank_account_id: row.linked_bank_account_id,
            metadata: {
                is_bank: BANK_VENDORS.includes(row.vendor),
                custom_number: row.custom_bank_account_number,
                mapped_vendor: row.mapped_card_vendor
            }
        }));
    }
});

export default handler;
