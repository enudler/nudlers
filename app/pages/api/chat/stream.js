import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDB } from '../db';
import logger from '../../../utils/logger.js';

// Verify auth via session cookies
// Note: This is a local-only app, so we bypass auth for simplicity.
// If you want to enforce auth, ensure session/sessionExpiry cookies are set.
function verifyAuth(req) {
  // For local development, allow all requests
  return true;

  // Original auth logic (commented out for local use):
  // const cookies = {};
  // if (req.headers.cookie) {
  //   req.headers.cookie.split(';').forEach(cookie => {
  //     const parts = cookie.trim().split('=');
  //     cookies[parts[0]] = parts[1];
  //   });
  // }
  // const sessionToken = cookies.session;
  // const sessionExpiry = cookies.sessionExpiry;
  // if (!sessionToken || !sessionExpiry) return false;
  // if (Date.now() > parseInt(sessionExpiry, 10)) return false;
  // return true;
}

const SYSTEM_PROMPT = `You are a smart financial analyst for "Nudlers" expense tracker. You have direct access to the user's transaction database through function calls.

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
  logger.info({ functionName: name, args }, 'Executing function');
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

  const db = await getDB();
  let apiKey = '';
  let modelName = 'gemini-2.5-flash'; // Default model

  try {
    // Get both API key and model setting
    const settingsResult = await db.query(
      'SELECT key, value FROM app_settings WHERE key IN ($1, $2)',
      ['gemini_api_key', 'gemini_model']
    );

    for (const row of settingsResult.rows) {
      const rawValue = row.value;
      const cleanValue = typeof rawValue === 'string' ? rawValue.replace(/"/g, '') : rawValue;
      if (row.key === 'gemini_api_key') {
        apiKey = cleanValue;
      } else if (row.key === 'gemini_model') {
        modelName = cleanValue;
      }
    }

    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured. Please add it in App Settings.' });
    }

    const { message, context, sessionId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE with headers to prevent buffering
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx/proxies
    res.flushHeaders();

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let currentSessionId = sessionId;

    // 1. Ensure we have a session and save the user message
    if (!currentSessionId) {
      const sessionResult = await db.query(
        'INSERT INTO chat_sessions (title) VALUES ($1) RETURNING id',
        [message.substring(0, 60)]
      );
      currentSessionId = sessionResult.rows[0].id;
    } else {
      // Update session timestamp
      await db.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [currentSessionId]);
    }

    // Save user message
    await db.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
      [currentSessionId, 'user', message]
    );

    // Send the sessionId to the frontend immediately
    sendEvent({ status: 'session_assigned', sessionId: currentSessionId });

    // 2. Fetch history if needed
    // We fetch the 50 most recent messages and order them chronologically by ID
    const historyResult = await db.query(
      `SELECT role, content FROM (
        SELECT id, role, content FROM chat_messages 
        WHERE session_id = $1 AND role != 'system' 
        ORDER BY id DESC LIMIT 50
      ) AS sub ORDER BY id ASC`,
      [currentSessionId]
    );

    // Filter out the message we just saved for history (it will be the last one in the chronological result)
    // We also ensure it alternates correctly if somehow the DB has inconsistent state
    const rawHistory = historyResult.rows.slice(0, -1);
    const previousMessages = [];

    for (let i = 0; i < rawHistory.length; i++) {
      const r = rawHistory[i];
      if (!r.content || r.content.trim() === '') continue;

      const role = r.role === 'assistant' ? 'model' : 'user';

      // Gemini history MUST alternate user/model. If consecutive, merge them.
      if (previousMessages.length > 0 && previousMessages[previousMessages.length - 1].role === role) {
        previousMessages[previousMessages.length - 1].parts[0].text += "\n" + r.content;
        continue;
      }

      // History MUST start with a user message
      if (previousMessages.length === 0 && role !== 'user') {
        continue;
      }

      previousMessages.push({
        role,
        parts: [{ text: r.content }]
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Use the model from settings (no fallback loop - show actual error)
    let model = null;
    let workingModel = modelName;
    let initError = null;

    logger.info({ modelName }, 'Using model from settings');

    // Build context
    const now = new Date();
    let contextInfo = `\nToday is ${now.toISOString().split('T')[0]}.`;
    if (context?.view) contextInfo += ` User is viewing: ${context.view}.`;
    if (context?.dateRange) {
      contextInfo += ` Current date range filter: ${context.dateRange.startDate} to ${context.dateRange.endDate}.`;
    }

    try {
      model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT + contextInfo,
        tools,
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000 }
      });
    } catch (e) {
      initError = e;
      logger.error({ modelName, error: e.message }, 'Failed to initialize model');
    }

    if (!model) {
      let errorMsg = `Failed to initialize model "${modelName}". `;
      if (initError) {
        const errLower = initError.message?.toLowerCase() || '';
        if (errLower.includes('quota')) {
          errorMsg = 'API quota exceeded. Please try again later or check your Gemini API billing.';
        } else if (errLower.includes('api_key_invalid') || errLower.includes('api key not valid')) {
          errorMsg = 'Invalid Gemini API key. Please check your settings.';
        } else if (errLower.includes('not found') || errLower.includes('404')) {
          errorMsg = `Model "${modelName}" not found. Please check your API key has access to this model or try a different model in settings.`;
        } else {
          errorMsg += initError.message || 'Unknown error.';
        }
      }
      sendEvent({ error: errorMsg, status: 'error' });
      res.end();
      return;
    }

    sendEvent({ status: 'thinking', model: workingModel });

    const chat = model.startChat({
      history: previousMessages
    });

    // 3. Send message with true streaming
    let result;
    try {
      result = await chat.sendMessageStream(message);
    } catch (err) {
      logger.error({ error: err.message }, 'Initial sendMessageStream failed');
      throw err;
    }

    let fullText = '';
    let iterationCount = 0;
    const MAX_ITERATIONS = 5;

    // Loop to handle potential function calls and final response
    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      let functionCalls = [];

      try {
        for await (const chunk of result.stream) {
          // Handle text content safely - chunk.text() throws if no text is present (e.g. function call chunks)
          try {
            const chunkText = chunk.text();
            if (chunkText) {
              fullText += chunkText;
              // Send streaming event to frontend
              sendEvent({ status: 'streaming', text: fullText, done: false });
              // Force flush if possible
              if (res.flush) res.flush();
              // Small delay to ensure network chunks are distinct
              await new Promise(r => setTimeout(r, 10));
            }
          } catch (e) {
            // Ignore error when chunk contains no text (likely a function call chunk)
            logger.debug('Chunk contains no text, skipping text extraction');
          }

          // Handle function calls
          try {
            const calls = chunk.functionCalls();
            if (calls && calls.length > 0) {
              functionCalls = functionCalls.concat(calls);
            }
          } catch (e) {
            logger.debug('Chunk contains no function calls');
          }
        }
      } catch (streamErr) {
        logger.error({ error: streamErr.message }, 'Stream iteration failed');
        if (streamErr.message?.includes('output text or tool calls')) {
          // This specific error happens if the model output is empty
          if (fullText) break; // If we already have some text, just finish
          fullText = "I encountered an issue generating a response. This can happen with experimental models or safety filters. Please try rephrasing your question.";
          break;
        }
        throw streamErr;
      }

      // If no function calls, we are done
      if (functionCalls.length === 0) break;

      // Execute functions
      sendEvent({
        status: 'fetching_data',
        functions: functionCalls.map(f => f.name),
        message: `Analyzing: ${functionCalls.map(f => f.name.replace(/_/g, ' ')).join(', ')}...`
      });

      const functionResponses = [];
      for (const call of functionCalls) {
        try {
          const funcResult = await executeFunction(call.name, call.args);
          functionResponses.push({
            functionResponse: { name: call.name, response: funcResult }
          });
        } catch (err) {
          logger.error({ functionName: call.name, error: err.message }, 'Function execution error');
          functionResponses.push({
            functionResponse: { name: call.name, response: { error: err.message } }
          });
        }
      }

      // Send function responses back and get a new stream
      result = await chat.sendMessageStream(functionResponses);
      // We don't reset fullText here because we want the AI's final answer 
      // to follow its thoughts/actions if any (though usually it just replaces it in this UI)
    }

    if (iterationCount >= MAX_ITERATIONS) {
      logger.warn('AI reached max function call iterations');
      sendEvent({
        status: 'streaming',
        text: fullText + '\n\n*(Note: I reached my limit of analysis steps for this request. Please ask for more details if needed.)*',
        done: false
      });
    }

    // Save final assistant message to DB
    await db.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
      [currentSessionId, 'assistant', fullText]
    );

    sendEvent({
      status: 'complete',
      text: fullText,
      done: true,
      model: workingModel,
      sessionId: currentSessionId
    });

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'AI Chat Error');
    if (res.writableEnded) return;

    let userMessage = error.message || 'Failed to get AI response';
    const errLower = userMessage.toLowerCase();

    if (errLower.includes('quota')) {
      userMessage = 'API quota exceeded. Please try again later or check your Gemini API billing.';
    } else if (errLower.includes('api_key_invalid') || errLower.includes('api key not valid')) {
      userMessage = 'Invalid Gemini API key. Please check your settings.';
    } else if (errLower.includes('not found') || errLower.includes('404')) {
      userMessage = `Model not found. Please check your API key has access to this model or try a different model in settings.`;
    } else if (errLower.includes('safety') || errLower.includes('blocked')) {
      userMessage = 'Response was blocked by safety filters. Please try rephrasing your question.';
    } else if (userMessage.includes('GoogleGenerativeAI Error')) {
      // Extract the actual error message
      userMessage = userMessage.split('] ').pop() || userMessage;
    }

    try {
      sendEvent({ error: userMessage, status: 'error' });
    } catch (e) {
      // ignore
    }
  } finally {
    db.release();
  }

  res.end();
}

export const config = { api: { bodyParser: true } };
