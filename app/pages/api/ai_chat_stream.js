import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDB } from './db';

// Verify auth via session cookies
function verifyAuth(req) {
  const cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      cookies[parts[0]] = parts[1];
    });
  }
  const sessionToken = cookies.session;
  const sessionExpiry = cookies.sessionExpiry;
  if (!sessionToken || !sessionExpiry) return false;
  if (Date.now() > parseInt(sessionExpiry, 10)) return false;
  return true;
}

const SYSTEM_PROMPT = `You are a smart financial analyst for "Clarify" expense tracker. You have direct access to the user's transaction database through function calls.

CRITICAL RULES:
1. ALWAYS call functions to get real data before answering questions about spending, transactions, or finances
2. NEVER guess or make up numbers - always fetch actual data
3. After getting data, perform calculations and analysis yourself
4. Format amounts in ₪ (Israeli Shekel) with thousands separators
5. Be specific with numbers and dates from the actual data
6. If a query is unclear about dates, default to the current month

You have access to these tools:
- get_transactions: Get raw transaction list (filterable by date, category, search term)
- get_spending_by_category: Get spending breakdown by category  
- get_monthly_comparison: Compare spending between months
- get_recurring_payments: Get subscriptions and installment plans
- get_top_merchants: Get biggest spending by merchant/vendor
- search_transactions: Search transactions by name/description

When analyzing data:
- Calculate totals, averages, and percentages yourself
- Identify patterns and anomalies
- Give actionable insights
- Use bullet points and bold for key numbers`;

// Tool definitions
const tools = [{
  functionDeclarations: [
    {
      name: "get_transactions",
      description: "Fetch transaction list from database. Use this for detailed transaction analysis, finding specific transactions, or when you need raw data to calculate.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date (YYYY-MM-DD). Defaults to first day of current month." },
          endDate: { type: "string", description: "End date (YYYY-MM-DD). Defaults to today." },
          category: { type: "string", description: "Filter by category name (e.g., 'Food', 'Transport'). Leave empty for all." },
          searchTerm: { type: "string", description: "Search in transaction names (e.g., 'Netflix', 'Restaurant')" },
          limit: { type: "number", description: "Max transactions to return. Default 100, max 500." },
          sortBy: { type: "string", description: "Sort by 'amount' (largest first) or 'date' (newest first). Default: date" }
        }
      }
    },
    {
      name: "get_spending_by_category",
      description: "Get total spending grouped by category. Use this for category analysis, pie charts, or understanding where money goes.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD)" }
        }
      }
    },
    {
      name: "get_monthly_comparison",
      description: "Compare spending between two months or periods. Use for trend analysis.",
      parameters: {
        type: "object",
        properties: {
          month1: { type: "string", description: "First month (YYYY-MM)" },
          month2: { type: "string", description: "Second month (YYYY-MM)" }
        }
      }
    },
    {
      name: "get_recurring_payments",
      description: "Get all recurring subscriptions and active installment plans. Use to show fixed monthly costs.",
      parameters: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "get_top_merchants",
      description: "Get spending grouped by merchant/store name. Use to find where most money is spent.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          limit: { type: "number", description: "Number of top merchants. Default 20." }
        }
      }
    },
    {
      name: "search_transactions",
      description: "Search transactions by description. Use when user asks about specific merchant or type of spending.",
      parameters: {
        type: "object",
        properties: {
          searchTerm: { type: "string", description: "Text to search for in transaction names" },
          startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD)" }
        },
        required: ["searchTerm"]
      }
    }
  ]
}];

// Get default dates (current month)
function getDefaultDates() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];
  return { startDate, endDate };
}

// Function implementations
async function getTransactions({ startDate, endDate, category, searchTerm, limit = 100, sortBy = 'date' }) {
  const db = await getDB();
  try {
    const defaults = getDefaultDates();
    const start = startDate || defaults.startDate;
    const end = endDate || defaults.endDate;
    limit = Math.min(limit, 500);
    
    let sql = `
      SELECT 
        name, 
        price, 
        date, 
        category, 
        vendor,
        installments_number,
        installments_total
      FROM transactions
      WHERE date >= $1::date AND date <= $2::date
        AND category IS NOT NULL
        AND category != ''
    `;
    const params = [start, end];
    let paramIdx = 3;
    
    if (category) {
      sql += ` AND LOWER(category) = LOWER($${paramIdx})`;
      params.push(category);
      paramIdx++;
    }
    
    if (searchTerm) {
      sql += ` AND LOWER(name) LIKE LOWER($${paramIdx})`;
      params.push(`%${searchTerm}%`);
      paramIdx++;
    }
    
    sql += sortBy === 'amount' 
      ? ` ORDER BY ABS(price) DESC` 
      : ` ORDER BY date DESC`;
    sql += ` LIMIT $${paramIdx}`;
    params.push(limit);
    
    const result = await db.query(sql, params);
    
    const transactions = result.rows.map(r => ({
      name: r.name,
      amount: Math.abs(parseFloat(r.price)),
      date: r.date,
      category: r.category,
      vendor: r.vendor,
      installment: r.installments_total > 1 ? `${r.installments_number}/${r.installments_total}` : null
    }));
    
    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
    
    return {
      transactions,
      count: transactions.length,
      totalAmount: Math.round(total),
      dateRange: { start, end },
      averageTransaction: transactions.length > 0 ? Math.round(total / transactions.length) : 0
    };
  } finally {
    db.release();
  }
}

async function getSpendingByCategory({ startDate, endDate }) {
  const db = await getDB();
  try {
    const defaults = getDefaultDates();
    const start = startDate || defaults.startDate;
    const end = endDate || defaults.endDate;
    
    const result = await db.query(`
      SELECT 
        category,
        COUNT(*) as count,
        ABS(ROUND(SUM(price))) as total,
        ABS(ROUND(AVG(price))) as average
      FROM transactions
      WHERE date >= $1::date AND date <= $2::date
        AND category IS NOT NULL 
        AND category != ''
        AND category != 'Bank'
        AND category != 'Income'
      GROUP BY category
      ORDER BY ABS(SUM(price)) DESC
    `, [start, end]);
    
    const categories = result.rows.map(r => ({
      category: r.category,
      transactionCount: parseInt(r.count),
      totalSpent: parseFloat(r.total),
      averageTransaction: parseFloat(r.average)
    }));
    
    const grandTotal = categories.reduce((sum, c) => sum + c.totalSpent, 0);
    
    return {
      categories: categories.map(c => ({
        ...c,
        percentOfTotal: grandTotal > 0 ? Math.round((c.totalSpent / grandTotal) * 100) : 0
      })),
      totalSpending: Math.round(grandTotal),
      dateRange: { start, end },
      categoryCount: categories.length
    };
  } finally {
    db.release();
  }
}

async function getMonthlyComparison({ month1, month2 }) {
  const db = await getDB();
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    
    const m1 = month1 || currentMonth;
    const m2 = month2 || previousMonth;
    
    const result = await db.query(`
      SELECT 
        TO_CHAR(date, 'YYYY-MM') as month,
        category,
        ABS(ROUND(SUM(price))) as total
      FROM transactions
      WHERE TO_CHAR(date, 'YYYY-MM') IN ($1, $2)
        AND category IS NOT NULL
        AND category != ''
        AND category != 'Bank'
        AND category != 'Income'
      GROUP BY TO_CHAR(date, 'YYYY-MM'), category
      ORDER BY month, ABS(SUM(price)) DESC
    `, [m1, m2]);
    
    const month1Data = { total: 0, categories: {} };
    const month2Data = { total: 0, categories: {} };
    
    for (const row of result.rows) {
      const amount = parseFloat(row.total);
      if (row.month === m1) {
        month1Data.total += amount;
        month1Data.categories[row.category] = amount;
      } else {
        month2Data.total += amount;
        month2Data.categories[row.category] = amount;
      }
    }
    
    const allCategories = [...new Set([...Object.keys(month1Data.categories), ...Object.keys(month2Data.categories)])];
    const categoryComparison = allCategories.map(cat => ({
      category: cat,
      month1Amount: month1Data.categories[cat] || 0,
      month2Amount: month2Data.categories[cat] || 0,
      difference: (month1Data.categories[cat] || 0) - (month2Data.categories[cat] || 0)
    })).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
    
    return {
      month1: { month: m1, totalSpending: Math.round(month1Data.total) },
      month2: { month: m2, totalSpending: Math.round(month2Data.total) },
      difference: Math.round(month1Data.total - month2Data.total),
      percentChange: month2Data.total > 0 
        ? Math.round(((month1Data.total - month2Data.total) / month2Data.total) * 100) 
        : 0,
      categoryComparison: categoryComparison.slice(0, 10)
    };
  } finally {
    db.release();
  }
}

async function getRecurringPayments() {
  const db = await getDB();
  try {
    // Active installments
    const installmentsResult = await db.query(`
      WITH latest AS (
        SELECT 
          name, price, category, 
          installments_number, installments_total,
          date,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(name)), ABS(price)
            ORDER BY date DESC
          ) as rn
        FROM transactions
        WHERE installments_total > 1
      )
      SELECT * FROM latest WHERE rn = 1
      ORDER BY ABS(price) DESC
    `);
    
    // Recurring (same amount, multiple months)
    const recurringResult = await db.query(`
      SELECT 
        name,
        ABS(price) as amount,
        category,
        COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) as month_count,
        MAX(date) as last_date
      FROM transactions
      WHERE price < 0
        AND (installments_total IS NULL OR installments_total <= 1)
        AND category NOT IN ('Bank', 'Income')
      GROUP BY LOWER(TRIM(name)), ABS(price), name, category
      HAVING COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) >= 2
      ORDER BY ABS(price) DESC
      LIMIT 30
    `);
    
    const installments = installmentsResult.rows
      .filter(r => r.installments_number < r.installments_total)
      .map(r => ({
        name: r.name,
        monthlyAmount: Math.abs(parseFloat(r.price)),
        category: r.category,
        progress: `${r.installments_number}/${r.installments_total}`,
        remainingPayments: r.installments_total - r.installments_number,
        remainingTotal: Math.abs(parseFloat(r.price)) * (r.installments_total - r.installments_number)
      }));
    
    const subscriptions = recurringResult.rows.map(r => ({
      name: r.name,
      monthlyAmount: parseFloat(r.amount),
      category: r.category,
      frequency: r.month_count >= 6 ? 'Monthly' : 'Recurring',
      lastCharge: r.last_date
    }));
    
    const totalMonthlyInstallments = installments.reduce((sum, i) => sum + i.monthlyAmount, 0);
    const totalMonthlySubscriptions = subscriptions.reduce((sum, s) => sum + s.monthlyAmount, 0);
    
    return {
      installments,
      subscriptions,
      totalMonthlyFixed: Math.round(totalMonthlyInstallments + totalMonthlySubscriptions),
      installmentCount: installments.length,
      subscriptionCount: subscriptions.length
    };
  } finally {
    db.release();
  }
}

async function getTopMerchants({ startDate, endDate, limit = 20 }) {
  const db = await getDB();
  try {
    const defaults = getDefaultDates();
    const start = startDate || defaults.startDate;
    const end = endDate || defaults.endDate;
    
    const result = await db.query(`
      SELECT 
        name as merchant,
        category,
        COUNT(*) as transaction_count,
        ABS(ROUND(SUM(price))) as total_spent,
        ABS(ROUND(AVG(price))) as avg_transaction
      FROM transactions
      WHERE date >= $1::date AND date <= $2::date
        AND category IS NOT NULL
        AND category != ''
        AND category != 'Bank'
      GROUP BY name, category
      ORDER BY ABS(SUM(price)) DESC
      LIMIT $3
    `, [start, end, limit]);
    
    return {
      merchants: result.rows.map(r => ({
        merchant: r.merchant,
        category: r.category,
        transactionCount: parseInt(r.transaction_count),
        totalSpent: parseFloat(r.total_spent),
        averageAmount: parseFloat(r.avg_transaction)
      })),
      dateRange: { start, end }
    };
  } finally {
    db.release();
  }
}

async function searchTransactions({ searchTerm, startDate, endDate }) {
  const db = await getDB();
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const start = startDate || sixMonthsAgo.toISOString().split('T')[0];
    const end = endDate || now.toISOString().split('T')[0];
    
    const result = await db.query(`
      SELECT 
        name, price, date, category, vendor
      FROM transactions
      WHERE date >= $1::date AND date <= $2::date
        AND LOWER(name) LIKE LOWER($3)
      ORDER BY date DESC
      LIMIT 50
    `, [start, end, `%${searchTerm}%`]);
    
    const transactions = result.rows.map(r => ({
      name: r.name,
      amount: Math.abs(parseFloat(r.price)),
      date: r.date,
      category: r.category
    }));
    
    return {
      searchTerm,
      matches: transactions,
      matchCount: transactions.length,
      totalAmount: Math.round(transactions.reduce((sum, t) => sum + t.amount, 0)),
      dateRange: { start, end }
    };
  } finally {
    db.release();
  }
}

// Execute function
async function executeFunction(name, args) {
  console.log(`Executing function: ${name}`, args);
  switch (name) {
    case 'get_transactions': return await getTransactions(args || {});
    case 'get_spending_by_category': return await getSpendingByCategory(args || {});
    case 'get_monthly_comparison': return await getMonthlyComparison(args || {});
    case 'get_recurring_payments': return await getRecurringPayments();
    case 'get_top_merchants': return await getTopMerchants(args || {});
    case 'search_transactions': return await searchTransactions(args || {});
    default: return { error: `Unknown function: ${name}` };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  const { message, context } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Try capable models with function calling
    const modelNames = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
    let model = null;
    let workingModel = null;
    
    for (const modelName of modelNames) {
      try {
        model = genAI.getGenerativeModel({ 
          model: modelName,
          tools,
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000 }
        });
        // Quick test
        await model.generateContent("test");
        workingModel = modelName;
        console.log(`Using model: ${modelName}`);
        break;
      } catch (e) {
        console.log(`Model ${modelName} failed:`, e.message);
      }
    }

    if (!model) {
      sendEvent({ error: 'No AI model available', status: 'error' });
      res.end();
      return;
    }

    sendEvent({ status: 'thinking', model: workingModel });

    // Build context
    const now = new Date();
    let contextInfo = `\nToday is ${now.toISOString().split('T')[0]}.`;
    if (context?.view) contextInfo += ` User is viewing: ${context.view}`;
    if (context?.dateRange) {
      contextInfo += ` Date range: ${context.dateRange.startDate} to ${context.dateRange.endDate}`;
    }

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT + contextInfo }] },
        { role: "model", parts: [{ text: "I'm ready to analyze your financial data. I'll fetch real transaction data to answer your questions accurately." }] }
      ]
    });

    // Send message
    let result = await chat.sendMessage(message);
    let response = result.response;
    
    // Handle function calls (loop up to 5 times)
    for (let i = 0; i < 5; i++) {
      const functionCalls = response.functionCalls();
      if (!functionCalls?.length) break;
      
      sendEvent({ 
        status: 'fetching_data', 
        functions: functionCalls.map(f => f.name),
        message: `Querying: ${functionCalls.map(f => f.name.replace(/_/g, ' ')).join(', ')}...`
      });
      
      const functionResponses = [];
      for (const call of functionCalls) {
        try {
          const funcResult = await executeFunction(call.name, call.args);
          functionResponses.push({
            functionResponse: { name: call.name, response: funcResult }
          });
        } catch (err) {
          console.error(`Function ${call.name} error:`, err);
          functionResponses.push({
            functionResponse: { name: call.name, response: { error: err.message } }
          });
        }
      }
      
      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    // Stream response
    const text = response.text();
    const words = text.split(' ');
    let accumulated = '';
    
    for (let i = 0; i < words.length; i++) {
      accumulated += (i > 0 ? ' ' : '') + words[i];
      sendEvent({ status: 'streaming', text: accumulated, done: false });
      await new Promise(r => setTimeout(r, 15));
    }
    
    sendEvent({ status: 'complete', text: accumulated, done: true, model: workingModel });

  } catch (error) {
    console.error('AI Chat Error:', error);
    sendEvent({ error: error.message || 'Failed to get AI response', status: 'error' });
  }

  res.end();
}

export const config = { api: { bodyParser: true } };
