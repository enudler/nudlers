import { getDB } from "./db";

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Only POST method is allowed" });
  }

  const { categoryName, deleteRules = true, deleteBudget = true } = req.body;
  
  if (!categoryName || typeof categoryName !== 'string' || categoryName.trim() === '') {
    return res.status(400).json({ error: "Category name is required" });
  }

  const client = await getDB();
  
  try {
    const trimmedCategoryName = categoryName.trim();
    
    // Set category to NULL for all transactions with this category (makes them "Uncategorized")
    const transactionsResult = await client.query(
      `UPDATE transactions 
       SET category = NULL
       WHERE category = $1`,
      [trimmedCategoryName]
    );
    
    let rulesDeleted = 0;
    let budgetDeleted = 0;
    
    // Optionally delete categorization rules that target this category
    if (deleteRules) {
      const rulesResult = await client.query(
        `DELETE FROM categorization_rules 
         WHERE target_category = $1`,
        [trimmedCategoryName]
      );
      rulesDeleted = rulesResult.rowCount;
    }
    
    // Optionally delete budget for this category
    if (deleteBudget) {
      const budgetResult = await client.query(
        `DELETE FROM budgets 
         WHERE category = $1`,
        [trimmedCategoryName]
      );
      budgetDeleted = budgetResult.rowCount;
    }
    
    res.status(200).json({ 
      success: true, 
      message: `Successfully deleted category "${trimmedCategoryName}"`,
      transactionsUncategorized: transactionsResult.rowCount,
      rulesDeleted,
      budgetDeleted
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}

export default handler;
