import { createAuthenticatedApiHandler } from "../middleware/auth";
import { decrypt } from "../utils/encryption";

const handler = createAuthenticatedApiHandler({
  validate: (req) => {
    if (!['DELETE', 'GET', 'PATCH'].includes(req.method)) {
      return "Only DELETE, GET, and PATCH methods are allowed";
    }
    if (!req.query.id) {
      return "ID parameter is required";
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

    // PATCH method - update account (currently supports is_active toggle)
    if (req.method === 'PATCH') {
      const { is_active } = req.body;
      
      if (typeof is_active !== 'boolean') {
        throw new Error('is_active must be a boolean');
      }
      
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
    
    // GET or PATCH method - decrypt and return credentials
    if ((req.method === 'GET' || req.method === 'PATCH') && result.rows && result.rows[0]) {
      const row = result.rows[0];
      return {
        id: row.id,
        vendor: row.vendor,
        username: row.username ? decrypt(row.username) : null,
        password: req.method === 'GET' ? (row.password ? decrypt(row.password) : null) : undefined,
        id_number: row.id_number ? decrypt(row.id_number) : null,
        card6_digits: row.card6_digits ? decrypt(row.card6_digits) : null,
        nickname: row.nickname,
        bank_account_number: row.bank_account_number,
        is_active: row.is_active !== false,
        created_at: row.created_at
      };
    }
    
    return { success: true };
  }
});

export default handler; 