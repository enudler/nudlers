import { getDB } from "./db";
import logger from '../../utils/logger.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Only POST method is allowed" });
  }

  const { oldName, newName } = req.body;
  
  if (!oldName || typeof oldName !== 'string' || oldName.trim() === '') {
    return res.status(400).json({ error: "Current category name is required" });
  }
  if (!newName || typeof newName !== 'string' || newName.trim() === '') {
    return res.status(400).json({ error: "New category name is required" });
  }
  if (oldName.trim() === newName.trim()) {
    return res.status(400).json({ error: "New category name must be different from the current name" });
  }

  const client = await getDB();
  
  try {
    const trimmedOldName = oldName.trim();
    const trimmedNewName = newName.trim();
    
    // Update all transactions with the old category name to the new name
    const transactionsResult = await client.query(
      `UPDATE transactions 
       SET category = $1
       WHERE category = $2`,
      [trimmedNewName, trimmedOldName]
    );
    
    // Also update any categorization rules that target this category
    const rulesResult = await client.query(
      `UPDATE categorization_rules 
       SET target_category = $1, updated_at = CURRENT_TIMESTAMP
       WHERE target_category = $2`,
      [trimmedNewName, trimmedOldName]
    );
    
    // Also update any budgets for this category
    const budgetsResult = await client.query(
      `UPDATE budgets 
       SET category = $1, updated_at = CURRENT_TIMESTAMP
       WHERE category = $2`,
      [trimmedNewName, trimmedOldName]
    );
    
    res.status(200).json({ 
      success: true, 
      message: `Successfully renamed category "${trimmedOldName}" to "${trimmedNewName}"`,
      transactionsUpdated: transactionsResult.rowCount,
      rulesUpdated: rulesResult.rowCount,
      budgetsUpdated: budgetsResult.rowCount
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error renaming category");
    res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}

export default handler;
