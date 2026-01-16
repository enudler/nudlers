import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDB } from '../pages/api/db.js';
import logger from './logger.js';
import { getBillingCycleSql } from "./transaction_logic.js";

/**
 * Generates a daily financial summary using AI.
 * @returns {Promise<string>} The generated summary text
 */
export async function generateDailySummary() {
    const client = await getDB();

    try {
        // Get Gemini and WhatsApp settings
        const settingsResult = await client.query(
            'SELECT key, value FROM app_settings WHERE key IN ($1, $2, $3, $4)',
            ['gemini_api_key', 'gemini_model', 'whatsapp_summary_mode', 'billing_cycle_start_day']
        );

        const settings = {};
        for (const row of settingsResult.rows) {
            settings[row.key] = typeof row.value === 'string' ? row.value.replace(/"/g, '') : row.value;
        }

        let apiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('Gemini API key not configured');
        }

        const modelName = settings.gemini_model || 'gemini-2.5-flash';
        const summaryMode = settings.whatsapp_summary_mode || 'calendar';
        const startDay = parseInt(settings.billing_cycle_start_day) || 10;

        // Calculate Date Range & Column
        let startDate, endDate, dateColumn;
        let effectiveMonthSql = null;
        let queryParams = [];
        let whereClause = '';

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-11

        if (summaryMode === 'cycle') {
            effectiveMonthSql = getBillingCycleSql(startDay, 'date', 'processed_date');

            // Billing Cycle Mode
            // Logic: Identify the "Target Billing Month" (when the charge happens).
            // Usually, if today >= startDay, we are accumulating for NEXT month's bill.
            // If today < startDay, we are accumulating for THIS month's bill (which is about to close).

            let targetMonth = currentMonth;
            let targetYear = currentYear;

            if (now.getDate() >= startDay) {
                targetMonth = currentMonth + 1;
            }

            if (targetMonth > 11) {
                targetMonth = 0;
                targetYear++;
            }

            // Format target cycle as YYYY-MM
            const targetCycle = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

            whereClause = `(${effectiveMonthSql}) = $1`;
            queryParams = [targetCycle];

            // For display/logging purposes (optional)
            startDate = targetCycle;
            endDate = targetCycle;

        } else {
            // Calendar Month Mode (Default)
            // 1st of current month to Last of current month
            // Filter by 'date' (transaction date)
            const start = new Date(currentYear, currentMonth, 1);
            const end = new Date(currentYear, currentMonth + 1, 0);

            startDate = start.toISOString().split('T')[0];
            endDate = end.toISOString().split('T')[0];
            dateColumn = 'date';

            whereClause = `${dateColumn} >= $1 AND ${dateColumn} <= $2`;
            queryParams = [startDate, endDate];
        }

        // Get last 7 days of transactions (Independent of cycle, for context)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

        const transactionsResult = await client.query(
            `SELECT date, name, category, price, vendor
       FROM transactions
       WHERE date >= $1
       ORDER BY date DESC
       LIMIT 100`,
            [sevenDaysAgoStr]
        );

        // Get actual spent for the calculated period
        const budgetResult = await client.query(
            `SELECT category, budget_limit FROM budgets`
        );

        const actualResult = await client.query(
            `SELECT category, 
            ABS(ROUND(SUM(price))) as actual_spent
       FROM transactions
       WHERE ${whereClause}
         AND category IS NOT NULL 
         AND category != ''
         AND category != 'Bank'
       GROUP BY category
       ORDER BY actual_spent DESC`,
            queryParams
        );

        const totalBudgetResult = await client.query(
            `SELECT budget_limit FROM total_budget LIMIT 1`
        );

        // Build budget comparison
        const budgetMap = new Map();
        for (const row of budgetResult.rows) {
            budgetMap.set(row.category, parseFloat(row.budget_limit) || 0);
        }

        const actualMap = new Map();
        for (const row of actualResult.rows) {
            actualMap.set(row.category, parseFloat(row.actual_spent) || 0);
        }

        const allCategories = new Set([...budgetMap.keys(), ...actualMap.keys()]);
        const categoryBudgets = [];
        let totalActual = 0;

        for (const category of allCategories) {
            const budget = budgetMap.get(category) || 0;
            const actual = actualMap.get(category) || 0;
            totalActual += actual;

            if (budget > 0 || actual > 0) {
                categoryBudgets.push({
                    category,
                    budget,
                    actual,
                    remaining: budget - actual,
                    percentUsed: budget > 0 ? Math.round((actual / budget) * 100) : 0,
                    isOverBudget: budget > 0 && actual > budget
                });
            }
        }

        const totalBudget = totalBudgetResult.rows.length > 0
            ? parseFloat(totalBudgetResult.rows[0].budget_limit)
            : null;

        // Sort by spending
        categoryBudgets.sort((a, b) => b.actual - a.actual);
        const top3 = categoryBudgets.slice(0, 3);

        // Format last 10 transactions
        const last10Transactions = transactionsResult.rows.slice(0, 10)
            .map(t => `  • ${t.name} - ₪${Math.abs(parseFloat(t.price)).toFixed(0)} (${t.category || 'ללא קטגוריה'})`)
            .join('\n');

        // Generate AI summary
        const genAI = new GoogleGenerativeAI(apiKey);

        const prompt = `סכם בעברית (מקס 1200 תווים):

תקציב: ₪${totalBudget || 0} | הוצאות: ₪${totalActual} | ניצול: ${totalBudget ? Math.round((totalActual / totalBudget) * 100) : 0}%

קטגוריות:
${top3.map(c => `${c.category}: ₪${c.actual}`).join(', ')}

10 עסקאות אחרונות:
${last10Transactions}

כתוב:
1. כותרת + אימוג'י
2. סטטוס תקציב
3. רשימת 10 העסקאות
4. המלצה קצרה

פורמט יפה עם שורות חדשות.`;

        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    maxOutputTokens: 1500,
                    temperature: 0.7,
                }
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;

            // Log finish reason and safety ratings for debugging
            const finishReason = response.candidates?.[0]?.finishReason;
            const safetyRatings = response.candidates?.[0]?.safetyRatings;
            logger.info({
                model: modelName,
                finishReason,
                safetyRatings,
                textLength: response.text()?.length
            }, 'Daily summary generated');

            const text = response.text();
            return text;
        } catch (modelError) {
            logger.error({ modelName, error: modelError.message }, 'Model failed');
            throw modelError;
        }

    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error generating daily summary');
        throw error;
    } finally {
        client.release();
    }
}
