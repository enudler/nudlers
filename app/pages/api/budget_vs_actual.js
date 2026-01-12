import { getDB } from "./db";
import logger from '../../utils/logger.js';

// Ensure the total_budget table exists
async function ensureTotalBudgetTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS total_budget (
      id SERIAL PRIMARY KEY,
      budget_limit FLOAT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const client = await getDB();
  const { cycle, startDate, endDate, billingCycle } = req.query;

  // Need either cycle (legacy) or billingCycle or startDate+endDate
  if (!cycle && !billingCycle && (!startDate || !endDate)) {
    return res.status(400).json({ 
      error: "Either 'cycle'/'billingCycle' (format: YYYY-MM) or 'startDate' and 'endDate' are required" 
    });
  }

  try {
    // Ensure total_budget table exists
    await ensureTotalBudgetTable(client);
    
    let actualSpendingSql;
    let actualParams;
    
    if (billingCycle || cycle) {
      // Use billing cycle (processed_date filter)
      const cycleValue = billingCycle || cycle;
      if (!/^\d{4}-\d{2}$/.test(cycleValue)) {
        return res.status(400).json({ error: "Invalid cycle format. Use YYYY-MM format" });
      }
      actualSpendingSql = `
        SELECT 
          category,
          ABS(ROUND(SUM(price))) as actual_spent
        FROM transactions
        WHERE TO_CHAR(processed_date, 'YYYY-MM') = $1
          AND category IS NOT NULL 
          AND category != ''
          AND category != 'Bank'
        GROUP BY category
      `;
      actualParams = [cycleValue];
    } else {
      // Use date range (date filter)
      actualSpendingSql = `
        SELECT 
          category,
          ABS(ROUND(SUM(price))) as actual_spent
        FROM transactions
        WHERE date >= $1 AND date <= $2
          AND category IS NOT NULL 
          AND category != ''
          AND category != 'Bank'
        GROUP BY category
      `;
      actualParams = [startDate, endDate];
    }
    
    // Get all general budgets (not cycle-specific anymore)
    const budgetsSql = `
      SELECT 
        id,
        category,
        budget_limit
      FROM budgets
    `;
    
    // Get total budget limit
    const totalBudgetSql = `
      SELECT budget_limit
      FROM total_budget
      LIMIT 1
    `;
    
    const [actualResult, budgetsResult, totalBudgetResult] = await Promise.all([
      client.query(actualSpendingSql, actualParams),
      client.query(budgetsSql),
      client.query(totalBudgetSql)
    ]);
    
    // Create a map of actual spending
    const actualMap = new Map();
    for (const row of actualResult.rows) {
      actualMap.set(row.category, parseFloat(row.actual_spent) || 0);
    }
    
    // Create a map of budgets
    const budgetMap = new Map();
    for (const row of budgetsResult.rows) {
      budgetMap.set(row.category, {
        id: row.id,
        limit: parseFloat(row.budget_limit) || 0
      });
    }
    
    // Get all unique categories (from both budgets and actual spending)
    const allCategories = new Set([
      ...actualMap.keys(),
      ...budgetMap.keys()
    ]);
    
    // Build the comparison data
    const comparison = [];
    for (const category of allCategories) {
      const actual = actualMap.get(category) || 0;
      const budgetInfo = budgetMap.get(category);
      const budgetLimit = budgetInfo?.limit || 0;
      const budgetId = budgetInfo?.id || null;
      
      const remaining = budgetLimit - actual;
      const percentUsed = budgetLimit > 0 ? (actual / budgetLimit) * 100 : 0;
      
      comparison.push({
        category,
        budget_id: budgetId,
        budget_limit: budgetLimit,
        actual_spent: actual,
        remaining,
        percent_used: Math.round(percentUsed * 10) / 10,
        has_budget: budgetLimit > 0,
        is_over_budget: budgetLimit > 0 && actual > budgetLimit
      });
    }
    
    // Sort: categories with budgets first, then by percent used descending
    comparison.sort((a, b) => {
      if (a.has_budget && !b.has_budget) return -1;
      if (!a.has_budget && b.has_budget) return 1;
      if (a.has_budget && b.has_budget) {
        return b.percent_used - a.percent_used;
      }
      return b.actual_spent - a.actual_spent;
    });
    
    // Calculate totals from category budgets
    const categoryBudgetTotal = comparison.reduce((sum, c) => sum + c.budget_limit, 0);
    const totalActual = comparison.reduce((sum, c) => sum + c.actual_spent, 0);
    const categoryRemaining = categoryBudgetTotal - totalActual;
    
    // Get overall total spend budget (separate from category budgets)
    const totalSpendBudget = totalBudgetResult.rows.length > 0 
      ? parseFloat(totalBudgetResult.rows[0].budget_limit) 
      : null;
    const totalSpendRemaining = totalSpendBudget !== null ? totalSpendBudget - totalActual : null;
    const totalSpendPercentUsed = totalSpendBudget !== null && totalSpendBudget > 0
      ? Math.round((totalActual / totalSpendBudget) * 1000) / 10
      : null;
    
    res.status(200).json({
      cycle: billingCycle || cycle || `${startDate} to ${endDate}`,
      categories: comparison,
      totals: {
        budget: categoryBudgetTotal,
        actual: totalActual,
        remaining: categoryRemaining,
        percent_used: categoryBudgetTotal > 0 ? Math.round((totalActual / categoryBudgetTotal) * 1000) / 10 : 0
      },
      // Overall total spend budget across all credit cards
      total_spend_budget: {
        is_set: totalSpendBudget !== null,
        budget_limit: totalSpendBudget,
        actual_spent: totalActual,
        remaining: totalSpendRemaining,
        percent_used: totalSpendPercentUsed,
        is_over_budget: totalSpendBudget !== null && totalActual > totalSpendBudget
      }
    });
    
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in budget_vs_actual API");
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: error.message 
    });
  } finally {
    client.release();
  }
}
