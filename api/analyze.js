// File: api/analyze.js
// This is a Vercel Serverless Function (Node.js runtime)
// Make sure to install groq-sdk: npm install groq-sdk

import Groq from 'groq-sdk';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        response.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    const { ingredientsText, model: requestedModel } = request.body; // Client can suggest a model

    if (!ingredientsText || ingredientsText.trim() === '') {
        response.status(400).json({ error: 'Missing ingredientsText in request body' });
        return;
    }

    // Get API Key from Vercel Environment Variables
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
        console.error('Groq API Key is not configured in Vercel environment variables.');
        response.status(500).json({ error: 'Analysis service is not configured on the server (missing API key).' });
        return;
    }

    const groq = new Groq({ apiKey: GROQ_API_KEY });
    const modelToUse = requestedModel || "llama-3.3-70b-versatile"; // Default to llama-3.3-70b-versatile

    // The prompt remains the same as it defines the task and expected JSON output structure
    const prompt = `
You are an expert food ingredient analyst. Analyze the following list of ingredients and provide a comprehensive health assessment.
Your response MUST be a single, valid JSON object. Do not include any text before or after the JSON structure (e.g., no "'''json" markers or explanations).

INGREDIENTS:
${ingredientsText}

JSON Structure Expected:
{
  "overall_health_score": <integer, 0-100, representing overall healthiness>,
  "potential_side_effects": ["<string effect1>", "<string effect2>", ... <array of strings describing potential side effects>],
  "ingredients_analysis": {
    "toxic_banned": [
      {"name": "<string ingredient_name>", "explanation": "<string explanation: what it is, why used, health effects>", "reference_url": "<optional string URL or null>"}
    ],
    "bad": [
      {"name": "<string ingredient_name>", "explanation": "<string explanation>", "reference_url": "<optional string URL or null>"}
    ],
    "average": [
      {"name": "<string ingredient_name>", "explanation": "<string explanation>", "reference_url": "<optional string URL or null>"}
    ],
    "good": [
      {"name": "<string ingredient_name>", "explanation": "<string explanation>", "reference_url": "<optional string URL or null>"}
    ],
    "healthy": [
      {"name": "<string ingredient_name>", "explanation": "<string explanation>", "reference_url": "<optional string URL or null>"}
    ]
  },
  "other_observations": ["<string observation1>", "<string observation2>", ... <array of strings for other relevant notes>],
  "conclusion": {
    "summary": "<string overall summary of the product's healthiness based on ingredients>",
    "alternatives": ["<string healthier alternative product type or ingredient suggestion1>", "<string alternative2>", ... <array of strings>]
  }
}

Ensure all string values are properly escaped for JSON. If a category (e.g., "toxic_banned") has no ingredients, provide an empty array [].
Base your analysis on scientific evidence and general nutritional guidelines. The overall_health_score should reflect the balance of healthy versus unhealthy ingredients.
For "reference_url", provide a URL to a reputable source if available for "toxic_banned" items, otherwise use null. For other categories, reference_url is optional.
    `;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a nutritional expert. Your response must be a single, valid JSON object matching the user's specified schema. Do not include any explanatory text outside this JSON structure, including markdown code block ticks."
                },
                {
                    role: "user",
                    content: prompt,
                }
            ],
            model: modelToUse,
            temperature: 0.2, // Lower temperature for more deterministic, structured output
            max_tokens: 4096, // Adjust as needed for the expected JSON size
            // For Groq, you might try to explicitly ask for JSON mode if supported by the model/API version
            // This is often done via a parameter like `response_format: { type: "json_object" }`
            // Check Groq's latest SDK/API documentation for the exact way to request JSON mode.
            // If not available, the strong prompting is key.
        });

        const responseContent = chatCompletion.choices[0]?.message?.content;

        if (!responseContent) {
            console.error('Groq API returned empty or unexpected content structure:', chatCompletion);
            response.status(500).json({ error: 'Analysis failed: No content received from AI.' });
            return;
        }
        
        // Sometimes models might still wrap their JSON in markdown, try to strip it.
        let cleanedJsonText = responseContent.trim();
        if (cleanedJsonText.startsWith("```json")) {
            cleanedJsonText = cleanedJsonText.substring(7);
            if (cleanedJsonText.endsWith("```")) {
                cleanedJsonText = cleanedJsonText.substring(0, cleanedJsonText.length - 3);
            }
        }
        cleanedJsonText = cleanedJsonText.trim();


        try {
            const analysisData = JSON.parse(cleanedJsonText);
            response.status(200).json(analysisData);
        } catch (parseError) {
            console.error("Error parsing JSON from Groq in serverless function:", parseError, "\nReceived text from Groq (after cleaning):", cleanedJsonText, "\nOriginal text:", responseContent);
            response.status(500).json({ error: 'Server error: Could not parse JSON response from AI. The AI might not have followed the JSON structure perfectly.' });
        }

    } catch (error) {
        console.error('Error in analysis serverless function (Groq):', error);
        let statusCode = 500;
        let errorMessage = `Server error during analysis: ${error.message}`;
        if (error.status) { // Groq SDK might throw errors with a status property
            statusCode = error.status;
        }
        if (error.error?.message) { // Groq SDK error structure
            errorMessage = `Groq API Error: ${error.error.message}`;
        }
        response.status(statusCode).json({ error: errorMessage });
    }
}
