import { createApiHandler } from "../utils/apiHandler";
import { decrypt, encrypt } from "../utils/encryption";

const handler = createApiHandler({
  validate: (req) => {
    if (!['DELETE', 'GET', 'PATCH', 'PUT'].includes(req.method)) {
      return "Only DELETE, GET, PATCH, and PUT methods are allowed";
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

    // PATCH method - update account (supports is_active toggle)
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

    // PUT method - full account update
    if (req.method === 'PUT') {
      const { vendor, username, password, id_number, card6_digits, nickname, bank_account_number } = req.body;
      
      if (!vendor) {
        throw new Error('Vendor is required');
      }
      if (!nickname) {
        throw new Error('Nickname is required');
      }
      
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
      
      // Only update password if provided (allows keeping existing password)
      if (password) {
        updates.push(`password = $${paramIndex}`);
        params.push(encrypt(password));
        paramIndex++;
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