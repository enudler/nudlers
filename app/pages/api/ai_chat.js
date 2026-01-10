import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `You are a concise financial assistant for "Clarify" expense tracker.

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

  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your environment variables.' 
    });
  }

  try {
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

    // Try fastest models first (flash/lite variants are optimized for speed)
    const modelNames = [
      "gemini-2.5-flash-lite",  // Fastest, lowest latency
      "gemini-2.5-flash",       // Fast with good quality
      "gemini-2.0-flash-lite",  // Fallback fast model
      "gemini-2.0-flash",       // Fallback
      "gemini-1.5-flash",       // Legacy fast model
      "gemini-pro",             // Legacy fallback
    ];
    
    let lastError = null;
    
    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            maxOutputTokens: 500,  // Keep responses concise
            temperature: 0.7,      // Balance creativity and consistency
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
        console.log(`Model ${modelName} failed:`, modelError.message);
        lastError = modelError;
        // Continue to next model
      }
    }
    
    // If all models failed, throw the last error
    throw lastError;

  } catch (error) {
    console.error('Gemini API error:', error);
    
    // Handle specific error types
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key not valid')) {
      return res.status(401).json({ 
        error: 'Invalid Gemini API key. Please check your GEMINI_API_KEY environment variable.' 
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
  }
}

export default handler;
