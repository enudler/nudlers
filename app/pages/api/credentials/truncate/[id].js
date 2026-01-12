import { getDB } from "../../db";
import logger from '../../../../utils/logger.js';

/**
 * API endpoint to truncate (delete) all transaction data for a specific account.
 * This removes all transactions associated with the account's vendor/nickname.
 * 
 * DELETE /api/credentials/truncate/[id]
 */
async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed. Use DELETE.' });
  }

  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Account ID is required' });
  }

  const client = await getDB();
  
  try {
    // First, get the account details to know which transactions to delete
    const accountResult = await client.query(
      'SELECT vendor, nickname, bank_account_number FROM vendor_credentials WHERE id = $1',
      [id]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accountResult.rows[0];
    const { vendor, nickname } = account;

    // Delete all transactions that match the vendor and account_number (nickname)
    // The account_number in transactions typically contains the account nickname
    let deleteResult;
    
    if (nickname) {
      // If we have a nickname, use it to be more specific (in case of multiple accounts from same vendor)
      deleteResult = await client.query(
        'DELETE FROM transactions WHERE vendor = $1 AND account_number = $2',
        [vendor, nickname]
      );
      
      // If no rows were deleted with nickname, try vendor only
      if (deleteResult.rowCount === 0) {
        deleteResult = await client.query(
          'DELETE FROM transactions WHERE vendor = $1',
          [vendor]
        );
      }
    } else {
      // No nickname, delete all transactions for this vendor
      deleteResult = await client.query(
        'DELETE FROM transactions WHERE vendor = $1',
        [vendor]
      );
    }

    res.status(200).json({ 
      success: true, 
      message: `Deleted ${deleteResult.rowCount} transactions for account ${nickname || vendor}`,
      deletedCount: deleteResult.rowCount
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Error truncating account data');
    res.status(500).json({ error: 'Failed to truncate account data' });
  } finally {
    client.release();
  }
}

export default handler;
