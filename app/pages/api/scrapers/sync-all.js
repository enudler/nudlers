import { getDB } from '../db';
import { decrypt } from '../utils/encryption';
import logger from '../../../utils/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getDB();

  try {
    // Get all active accounts
    const accountsResult = await client.query(`
      SELECT 
        id,
        vendor,
        username,
        password,
        id_number,
        card6_digits,
        nickname,
        bank_account_number
      FROM vendor_credentials
      WHERE is_active = true
      ORDER BY last_synced_at ASC NULLS FIRST, id ASC
    `);

    if (accountsResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active accounts to sync',
        accounts: []
      });
    }

    // Decrypt credentials and format for response
    const accounts = accountsResult.rows.map(row => ({
      id: row.id,
      vendor: row.vendor,
      username: row.username ? decrypt(row.username) : null,
      password: row.password ? decrypt(row.password) : null,
      id_number: row.id_number ? decrypt(row.id_number) : null,
      card6_digits: row.card6_digits ? decrypt(row.card6_digits) : null,
      nickname: row.nickname,
      bank_account_number: row.bank_account_number
    }));

    res.status(200).json({
      success: true,
      message: `Found ${accounts.length} active account(s) to sync`,
      accounts: accounts
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Sync all error');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}
