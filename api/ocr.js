// File: api/ocr.js
// This is a Vercel Serverless Function (Node.js runtime)

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // FIX: Changed 'imageBase64' to 'image_data' to match frontend request body
    const { image_data } = request.body; 
    if (!image_data) {
        response.status(400).json({ error: 'Missing image_data in request body' }); // FIX: Updated error message to reflect 'image_data'
        return;
    }

    // Get API Key from Vercel Environment Variables
    const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
    if (!GOOGLE_VISION_API_KEY) {
        console.error('Google Vision API Key is not configured in Vercel environment variables.');
        response.status(500).json({ error: 'OCR service is not configured on the server.' });
        return;
    }

    const visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;
    const requestPayload = {
        requests: [{
            image: { content: image_data }, // FIX: Used 'image_data' here
            features: [{ type: 'TEXT_DETECTION' }]
        }]
    };
    try {
        const visionResponse = await fetch(visionApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });
        const result = await visionResponse.json();

        if (!visionResponse.ok || result.error || (result.responses && result.responses[0].error)) {
            const errorMsg = result.error?.message ||
                result.responses?.[0]?.error?.message || "Unknown Vision API error";
            console.error('Google Vision API Error from serverless function:', result);
            response.status(visionResponse.status || 500).json({ error: `OCR API Error: ${errorMsg}` });
            return;
        }

        if (result.responses && result.responses[0] && result.responses[0].fullTextAnnotation) {
            const detectedText = result.responses[0].fullTextAnnotation.text;
            response.status(200).json({ text: detectedText });
        } else {
            response.status(200).json({ text: '', message: 'No text detected by OCR.' });
        }

    } catch (error) {
        console.error('Error in OCR serverless function:', error);
        response.status(500).json({ error: `Server error during OCR: ${error.message}` });
    }
}
