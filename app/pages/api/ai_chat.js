import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDB } from './db';
import logger from '../../utils/logger.js';

const SYSTEM_PROMPT = `You are a concise financial assistant for "Nudlers" expense tracker.

Use the provided screen context to give specific insights. Format amounts with ₪ symbol.

Rules:
- Be brief and actionable (2-4 sentences max unless detailed analysis requested)
- Use bullet points for lists
- Highlight key numbers
- If data is missing, ask for specifics`;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getDB();

  try {
    // Get Gemini settings
    const settingsResult = await client.query(
      'SELECT key, value FROM app_settings WHERE key IN ($1, $2)',
      ['gemini_api_key', 'gemini_model']
    );

    const settings = {};
    for (const row of settingsResult.rows) {
      settings[row.key] = typeof row.value === 'string' ? row.value.replace(/"/g, '') : row.value;
    }

    let apiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Gemini API key not configured. Please add it in App Settings.'
      });
    }

    const modelName = settings.gemini_model || 'gemini-2.5-flash';

    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Build the prompt with context
    let fullPrompt = SYSTEM_PROMPT + "\n\n";

    if (context) {
      fullPrompt += "Current screen context:\n";
      fullPrompt += JSON.stringify(context, null, 2);
      fullPrompt += "\n\n";
    }

    fullPrompt += "User question: " + message;

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
        }
      });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      return res.status(200).json({
        response: text,
        success: true,
        model: modelName
      });
    } catch (modelError) {
      logger.error({ modelName, error: modelError.message }, 'Model failed');
      throw modelError;
    }

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Gemini API error');

    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key not valid')) {
      return res.status(401).json({
        error: 'Invalid Gemini API key. Please check your settings.'
      });
    }

    if (error.message?.includes('QUOTA_EXCEEDED')) {
      return res.status(429).json({
        error: 'API quota exceeded. Please try again later.'
      });
    }

    if (error.message?.includes('404') || error.message?.includes('not found')) {
      return res.status(500).json({
        error: 'Model not available. Please check your API key has access to Gemini models.'
      });
    }

    return res.status(500).json({
      error: `AI service error: ${error.message || 'Unknown error'}. Please try again.`
    });
  } finally {
    client.release();
  }
}

export default handler;
