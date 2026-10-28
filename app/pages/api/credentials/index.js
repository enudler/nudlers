import { createApiHandler } from "../../../utils/apiHandler";
import { encrypt, decrypt, safeDecrypt } from "../utils/encryption";

const handler = createApiHandler({
  validate: (req) => {
    if (req.method === 'GET') {
      return null;
    }
    if (req.method === 'POST') {
      const { vendor } = req.body;
      if (!vendor) {
        return "Vendor is required";
      }
      if (vendor === 'yahav' && (typeof req.body.id_number !== 'string' || !req.body.id_number.trim())) {
        return "National ID is required for Yahav";
      }
    }
    return null;
  },
  query: async (req) => {
    try {
      if (req.method === 'GET') {
        const { vendor } = req.query;
        if (vendor) {
          return {
            sql: 'SELECT * FROM vendor_credentials WHERE vendor = $1 ORDER BY created_at DESC',
            params: [vendor]
          };
        }
        return {
          sql: 'SELECT * FROM vendor_credentials ORDER BY vendor'
        };
      }
      if (req.method === 'POST') {
        const { vendor, username, password, id_number, card6_digits, nickname, bank_account_number, phone_number } = req.body;

        // Encrypt sensitive data. otp_long_term_token is server-managed only — never accepted from clients.
        const encryptedData = {
          vendor,
          username: username ? encrypt(username) : null,
          password: password ? encrypt(password) : null,
          id_number: id_number ? encrypt(id_number) : null,
          card6_digits: card6_digits ? encrypt(card6_digits) : null,
          nickname,
          bank_account_number,
          phone_number: phone_number ? encrypt(phone_number) : null
        };

        return {
          sql: `
            INSERT INTO vendor_credentials (vendor, username, password, id_number, card6_digits, nickname, bank_account_number, phone_number)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `,
          params: [
            encryptedData.vendor,
            encryptedData.username,
            encryptedData.password,
            encryptedData.id_number,
            encryptedData.card6_digits,
            encryptedData.nickname,
            encryptedData.bank_account_number,
            encryptedData.phone_number
          ]
        };
      }
    } finally {

    }
  },
  transform: (result) => {
    if (result.rows) {
      return result.rows.map(row => ({
        id: row.id,
        vendor: row.vendor,
        username: row.username ? safeDecrypt(row.username) : null,
        // SECURITY: Never return password or otp_long_term_token to the client
        id_number: row.id_number ? safeDecrypt(row.id_number) : null,
        card6_digits: row.card6_digits ? safeDecrypt(row.card6_digits) : null,
        nickname: row.nickname,
        bank_account_number: row.bank_account_number,
        phone_number: row.phone_number ? safeDecrypt(row.phone_number) : null,
        has_otp_long_term_token: !!row.otp_long_term_token,
        is_active: row.is_active !== false, // Default to true if null
        created_at: row.created_at,
        last_synced_at: row.last_synced_at
      }));
    }
    return result;
  }
});

export default handler; 