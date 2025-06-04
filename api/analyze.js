// File: api/analyze.js
// This is a Vercel Serverless Function (Node.js runtime)

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    const { ingredientsText } = request.body;

    if (!ingredientsText || ingredientsText.trim() === '') {
        response.status(400).json({ error: 'Missing ingredientsText in request body' });
        return;
    }

    // Get API Key from Vercel Environment Variables
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        console.error('Gemini API Key is not configured in Vercel environment variables.');
        response.status(500).json({ error: 'Analysis service is not configured on the server.' });
        return;
    }

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
            
    // The prompt and schema are the same as in your client-side version
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

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { /* ... (same schema as before, ensure it's correctly defined here) ... */ 
            type: "OBJECT",
            properties: {
              "overall_health_score": { "type": "NUMBER" },
              "potential_side_effects": { "type": "ARRAY", "items": { "type": "STRING" } },
              "ingredients_analysis": {
                "type": "OBJECT",
                properties: {
                  "toxic_banned": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "explanation": { "type": "STRING" }, "reference_url": { "type": "STRING", "nullable": true } }, "required": ["name", "explanation"] }},
                  "bad": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "explanation": { "type": "STRING" }, "reference_url": { "type": "STRING", "nullable": true } }, "required": ["name", "explanation"] }},
                  "average": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "explanation": { "type": "STRING" }, "reference_url": { "type": "STRING", "nullable": true } }, "required": ["name", "explanation"] }},
                  "good": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "explanation": { "type": "STRING" }, "reference_url": { "type": "STRING", "nullable": true } }, "required": ["name", "explanation"] }},
                  "healthy": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "name": { "type": "STRING" }, "explanation": { "type": "STRING" }, "reference_url": { "type": "STRING", "nullable": true } }, "required": ["name", "explanation"] }}
                },
                 "required": ["toxic_banned", "bad", "average", "good", "healthy"]
              },
              "other_observations": { "type": "ARRAY", "items": { "type": "STRING" } },
              "conclusion": {
                "type": "OBJECT",
                properties: { "summary": { "type": "STRING" }, "alternatives": { "type": "ARRAY", "items": { "type": "STRING" } }},
                "required": ["summary", "alternatives"]
              }
            },
            "required": ["overall_health_score", "potential_side_effects", "ingredients_analysis", "other_observations", "conclusion"]
        }
      }
    };

    try {
        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await geminiResponse.json();

        if (!geminiResponse.ok || (result.candidates && result.candidates.length > 0 && result.candidates[0].finishReason !== "STOP" && result.candidates[0].finishReason !== undefined) || result.error) {
             const errorDetail = result.error?.message || (result.promptFeedback?.blockReason?.toString()) || (result.candidates?.[0]?.finishReason) || "Unknown Gemini API error";
             console.error('Gemini API Error Response from serverless function:', result);
             response.status(geminiResponse.status || 500).json({ error: `Analysis API Error: ${errorDetail}` });
             return;
        }

        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0].text) {
            const jsonText = result.candidates[0].content.parts[0].text;
            try {
                const analysisData = JSON.parse(jsonText); // The Gemini API with responseSchema should return parseable JSON directly
                response.status(200).json(analysisData);
            } catch (parseError) {
                console.error("Error parsing JSON from Gemini in serverless function:", parseError, "\nReceived text:", jsonText);
                response.status(500).json({ error: 'Server error: Could not parse JSON response from AI.' });
            }
        } else {
            console.error('Unexpected Gemini API response structure in serverless function:', result);
            response.status(500).json({ error: 'Analysis failed: Unexpected response structure from AI on server.'});
        }

    } catch (error) {
        console.error('Error in analysis serverless function:', error);
        response.status(500).json({ error: `Server error during analysis: ${error.message}` });
    }
}
