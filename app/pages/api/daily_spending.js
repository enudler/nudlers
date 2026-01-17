import { getDB } from "./db";
import logger from '../../utils/logger.js';
import { BANK_VENDORS } from '../../utils/constants.js';
import { getBillingCycleSql } from "../../utils/transaction_logic";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const client = await getDB();
  const { cycle, startDate, endDate } = req.query;

  // Need either cycle (billing mode) or startDate+endDate (calendar mode)
  if (!cycle && (!startDate || !endDate)) {
    return res.status(400).json({
      error: "Either 'cycle' (format: YYYY-MM) or 'startDate' and 'endDate' are required"
    });
  }

  try {
    // Get billing start day setting
    const settingsResult = await client.query(
      "SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'"
    );
    const billingStartDay = settingsResult.rows.length > 0
      ? parseInt(settingsResult.rows[0].value)
      : 10;

    let periodStartDate, periodEndDate, daysInPeriod, cycleLabel;
    let effectiveMonthSql = null;
    let queryParams = [];
    let whereClause = '';

    // Create placeholders for bank vendors ($3, $4, ...) or depending on params
    const bankPlaceholders = BANK_VENDORS.map((_, idx) => `$${idx + 1 + (cycle ? 1 : 2)}`).join(', ');
    // Wait, params index depends on mode.
    // If cycle: params=[cycle, ...bank] -> bank starts at $2
    // If dates: params=[start, end, ...bank] -> bank starts at $3

    if (cycle) {
      effectiveMonthSql = getBillingCycleSql(billingStartDay, 'date', 'processed_date');

      // Billing cycle mode - Calculate visual range based on start day
      if (!/^\d{4}-\d{2}$/.test(cycle)) {
        return res.status(400).json({ error: "Invalid cycle format. Use YYYY-MM format" });
      }

      const [year, month] = cycle.split('-').map(Number);

      // Calculate billing cycle dates for X-axis display
      let prevMonth = month - 1;
      let prevYear = year;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = year - 1;
      }

      periodStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${billingStartDay}`; // e.g. 10th
      // End date is day before start day of next month
      // Actually strictly: (StartDay) of current month - 1 day? 
      // Existing logic was "10th to 9th".
      const endDateVal = billingStartDay - 1;
      periodEndDate = `${year}-${String(month).padStart(2, '0')}-${String(endDateVal).padStart(2, '0')}`;
      cycleLabel = cycle;

      whereClause = `(${effectiveMonthSql}) = $1`;
      queryParams = [cycle, ...BANK_VENDORS];

    } else {
      // Calendar mode - use date range directly
      periodStartDate = startDate;
      periodEndDate = endDate;
      cycleLabel = `${startDate} to ${endDate}`;

      whereClause = `date >= $1 AND date <= $2`;
      queryParams = [startDate, endDate, ...BANK_VENDORS];
    }

    // Recalculate placeholders based on actual params length
    const bankParamsStartIndex = cycle ? 2 : 3;
    const currentBankPlaceholders = BANK_VENDORS.map((_, idx) => `$${idx + bankParamsStartIndex}`).join(', ');

    // Calculate days in period
    const pStart = new Date(periodStartDate);
    const pEnd = new Date(periodEndDate);
    const timeDiff = pEnd.getTime() - pStart.getTime();
    daysInPeriod = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Determine if we're in the current period
    const isCurrentPeriod = today >= pStart && today <= pEnd;

    // Calculate how many days into the period we are
    let maxDay;
    if (isCurrentPeriod) {
      const daysSinceStart = Math.ceil((today.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      maxDay = Math.min(daysSinceStart, daysInPeriod);
    } else if (today > pEnd) {
      maxDay = daysInPeriod;
    } else {
      maxDay = 0; // Future period
    }

    // Get daily spending with cycle day number calculated
    const dailySpendingSql = `
      SELECT
        date,
        ABS(ROUND(SUM(price))) as daily_spent
      FROM transactions
      WHERE ${whereClause}
        AND COALESCE(category, '') != 'Bank'
        AND vendor NOT IN (${currentBankPlaceholders})
      GROUP BY date
      ORDER BY date
    `;

    // Get total budget
    const totalBudgetSql = `
      SELECT COALESCE(SUM(budget_limit), 0) as total_budget
      FROM budgets
    `;

    const [dailyResult, budgetResult] = await Promise.all([
      client.query(dailySpendingSql, queryParams),
      client.query(totalBudgetSql)
    ]);

    const totalBudget = parseFloat(budgetResult.rows[0]?.total_budget) || 0;

    // Create a map of daily spending by date
    const dailyMap = new Map();
    for (const row of dailyResult.rows) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      dailyMap.set(dateStr, parseFloat(row.daily_spent) || 0);
    }

    // Build daily data with cumulative spending
    const dailyData = [];
    let cumulativeSpent = 0;

    for (let dayNum = 1; dayNum <= maxDay; dayNum++) {
      // Calculate the actual date for this cycle day
      const currentDate = new Date(pStart);
      currentDate.setDate(currentDate.getDate() + dayNum - 1);
      const dateStr = currentDate.toISOString().split('T')[0];

      const dailySpent = dailyMap.get(dateStr) || 0;
      cumulativeSpent += dailySpent;

      // Calculate ideal remaining (linear burndown)
      const idealRemaining = totalBudget - (totalBudget / daysInPeriod) * dayNum;
      const actualRemaining = totalBudget - cumulativeSpent;

      dailyData.push({
        day: dayNum,
        date: dateStr,
        daily_spent: dailySpent,
        cumulative_spent: cumulativeSpent,
        ideal_remaining: Math.round(idealRemaining),
        actual_remaining: Math.round(actualRemaining)
      });
    }

    res.status(200).json({
      cycle: cycleLabel,
      days_in_month: daysInPeriod,
      total_budget: totalBudget,
      is_current_month: isCurrentPeriod,
      daily_data: dailyData
    });

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error in daily_spending API");
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}
