import { createApiHandler } from "../../../utils/apiHandler";
import { decrypt, encrypt, safeDecrypt } from "../utils/encryption";

const ALLOWED_METHODS = ['DELETE', 'GET', 'PATCH', 'PUT'];

const innerHandler = createApiHandler({
  validate: (req) => {
    if (!req.query.id) {
      return "ID parameter is required";
    }
    if (req.method === 'PATCH') {
      if (typeof req.body?.is_active !== 'boolean') {
        return "is_active must be a boolean";
      }
    }
    if (req.method === 'PUT') {
      if (!req.body?.vendor) return "Vendor is required";
      if (!req.body?.nickname) return "Nickname is required";
      if (req.body.vendor === 'yahav' && (typeof req.body.id_number !== 'string' || !req.body.id_number.trim())) {
        return "National ID is required for Yahav";
      }
    }
  },
  query: async (req) => {
    const { id } = req.query;

    if (req.method === 'DELETE') {
      return {
        sql: `
          DELETE FROM vendor_credentials
          WHERE id = $1
        `,
        params: [id]
      };
    }

    // PATCH method - update account (supports is_active toggle)
    if (req.method === 'PATCH') {
      const { is_active } = req.body;

      return {
        sql: `
          UPDATE vendor_credentials
          SET is_active = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        params: [id, is_active]
      };
    }

    // PUT method - full account update
    if (req.method === 'PUT') {
      const { vendor, username, password, id_number, card6_digits, nickname, bank_account_number, phone_number } = req.body;

      // Build dynamic update query based on provided fields
      const updates = ['vendor = $2', 'nickname = $3', 'updated_at = CURRENT_TIMESTAMP'];
      const params = [id, vendor, nickname];
      let paramIndex = 4;

      // Always update these fields (can be null)
      updates.push(`username = $${paramIndex}`);
      params.push(username ? encrypt(username) : null);
      paramIndex++;

      updates.push(`id_number = $${paramIndex}`);
      params.push(id_number ? encrypt(id_number) : null);
      paramIndex++;

      updates.push(`card6_digits = $${paramIndex}`);
      params.push(card6_digits ? encrypt(card6_digits) : null);
      paramIndex++;

      updates.push(`bank_account_number = $${paramIndex}`);
      params.push(bank_account_number || null);
      paramIndex++;

      updates.push(`phone_number = $${paramIndex}`);
      params.push(phone_number ? encrypt(phone_number) : null);
      paramIndex++;

      // Only update password if provided (allows keeping existing password).
      // Password change invalidates any cached long-term OTP token — clear it so the user re-does 2FA.
      if (password) {
        updates.push(`password = $${paramIndex}`);
        params.push(encrypt(password));
        paramIndex++;
        updates.push('otp_long_term_token = NULL');
      }

      return {
        sql: `
          UPDATE vendor_credentials 
          SET ${updates.join(', ')}
          WHERE id = $1
          RETURNING *
        `,
        params: params
      };
    }

    // GET method - fetch credentials for scraping
    // SECURITY: This endpoint returns passwords and should be protected with authentication
    if (req.method === 'GET') {
      return {
        sql: `
          SELECT * FROM vendor_credentials 
          WHERE id = $1
        `,
        params: [id]
      };
    }
  },
  transform: (result, req) => {
    if (req.method === 'DELETE') {
      return { success: true };
    }

    // GET, PATCH, or PUT method - decrypt and return credentials
    if (['GET', 'PATCH', 'PUT'].includes(req.method) && result.rows && result.rows[0]) {
      const row = result.rows[0];
      return {
        id: row.id,
        vendor: row.vendor,
        username: row.username ? safeDecrypt(row.username) : null,
        password: req.method === 'GET' ? (row.password ? decrypt(row.password) : null) : undefined,
        id_number: row.id_number ? safeDecrypt(row.id_number) : null,
        card6_digits: row.card6_digits ? safeDecrypt(row.card6_digits) : null,
        nickname: row.nickname,
        bank_account_number: row.bank_account_number,
        phone_number: row.phone_number ? safeDecrypt(row.phone_number) : null,
        // SECURITY: never return otp_long_term_token; expose only its presence
        has_otp_long_term_token: !!row.otp_long_term_token,
        is_active: row.is_active !== false,
        created_at: row.created_at
      };
    }

    return { success: true };
  }
});

// If NUDLERS_API_KEY is set, GET (which returns the decrypted password) requires it
// as an Authorization Bearer header. Otherwise, allow all requests (local-only mode).
function verifyAuth(req) {
  const requiredKey = process.env.NUDLERS_API_KEY;
  if (!requiredKey) {
    return true;
  }
  const authHeader = req.headers.authorization;
  return !!(authHeader && authHeader.startsWith('Bearer ') && authHeader.slice(7) === requiredKey);
}

export default function handler(req, res) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (req.method === 'GET' && !verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return innerHandler(req, res);
}
