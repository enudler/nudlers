import { createApiHandler } from "../utils/apiHandler";
import { getDB } from "../db";
import logger from '../../../utils/logger.js';

const handler = createApiHandler({
  validate: (req) => {
    if (!['PATCH'].includes(req.method)) {
      return "Only PATCH method is allowed";
    }
    if (!req.query.id) {
      return "ID parameter is required";
    }
  },
  query: async (req) => {
    const { id } = req.query;
    const { linked_bank_account_id, custom_bank_account_number, custom_bank_account_nickname } = req.body;

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [id];
    let paramIndex = 2;

    // Determine mode: Linking to existing account vs Custom account
    if (linked_bank_account_id && linked_bank_account_id !== -1) {
      // LINKING EXISTING ACCOUNT
      updates.push(`linked_bank_account_id = $${paramIndex}`);
      params.push(linked_bank_account_id);
      paramIndex++;

      // Clear custom fields
      updates.push(`custom_bank_account_number = NULL`);
      updates.push(`custom_bank_account_nickname = NULL`);
    } else if (custom_bank_account_number !== undefined || custom_bank_account_nickname !== undefined) {
      // SETTING CUSTOM ACCOUNT (if either field is provided)

      // Update number if provided
      if (custom_bank_account_number !== undefined) {
        updates.push(`custom_bank_account_number = $${paramIndex}`);
        params.push(custom_bank_account_number);
        paramIndex++;
      }

      // Update nickname if provided
      if (custom_bank_account_nickname !== undefined) {
        updates.push(`custom_bank_account_nickname = $${paramIndex}`);
        params.push(custom_bank_account_nickname);
        paramIndex++;
      }

      // Clear linked account if not explicitly set
      if (!linked_bank_account_id) {
        updates.push(`linked_bank_account_id = NULL`);
      }
    } else if (linked_bank_account_id === null) {
      // EXPLICITLY CLEARING LINKED ACCOUNT
      updates.push(`linked_bank_account_id = NULL`);
    }

    if (updates.length > 0) {
      return {
        sql: `
            UPDATE card_ownership 
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING *
          `,
        params: params
      };
    } else {
      // No updates needed query (noop)
      return {
        sql: `SELECT * FROM card_ownership WHERE id = $1`,
        params: [id]
      };
    }
  },
  transform: async (result, req) => {
    if (req.method === 'PATCH' && result.rows && result.rows[0]) {
      const row = result.rows[0];

      // Fetch bank account details if linked
      if (row.linked_bank_account_id) {
        const client = await getDB();
        try {
          const bankResult = await client.query(
            `SELECT id, nickname, bank_account_number, vendor FROM vendor_credentials WHERE id = $1`,
            [row.linked_bank_account_id]
          );

          if (bankResult.rows.length === 0) {
            // Bank account was deleted, return without it
            return {
              ...row,
              bank_account: null
            };
          }

          return {
            ...row,
            bank_account: bankResult.rows[0]
          };
        } catch (error) {
          logger.error({ error: error.message, stack: error.stack }, 'Error fetching bank account');
          return {
            ...row,
            bank_account: null
          };
        } finally {
          client.release();
        }
      }

      return {
        ...row,
        bank_account: null
      };
    }

    return { success: true };
  }
});

export default handler;
