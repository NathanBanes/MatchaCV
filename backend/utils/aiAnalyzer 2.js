const OpenAI = require('openai');

// Function to get OpenAI client (check at runtime, not module load time)
function getOpenAIClient() {
    if (!process.env.OPENAI_API_KEY) {
        return null;
    }
    
    try {
        return new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    } catch (error) {
        console.error('AI Analyzer: Error creating OpenAI client:', error);
        return null;
    }
}

/**
 * Generate AI-powered personalized suggestions for resume optimization
 */
async function generateAISuggestions(resumeText, jobDescription, jobKeywords, currentScore) {
    // Check for API key at runtime
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.log('AI Analyzer: No OPENAI_API_KEY found in environment variables');
        return [];
    }
    
    // Get OpenAI client
    const openai = getOpenAIClient();
    if (!openai) {
        console.log('AI Analyzer: Failed to initialize OpenAI client');
        return [];
    }
    
    console.log('AI Analyzer: Generating AI-powered suggestions...');
    console.log('AI Analyzer: API Key present (length:', apiKey.length + ')');

    // Limit text length to avoid token limits (keep within reasonable bounds)
    const resumePreview = resumeText.substring(0, 3000);
    const jobPreview = jobDescription.substring(0, 2000);
    const technicalKeywords = jobKeywords.technical.slice(0, 20).join(', ');

    const prompt = `You are an expert resume and ATS optimization consultant. Analyze the following resume and job description to provide specific, actionable suggestions.

RESUME TEXT:
${resumePreview}

JOB DESCRIPTION:
${jobPreview}

CURRENT ATS SCORE: ${currentScore.toFixed(1)}%

KEY TECHNICAL KEYWORDS FROM JOB DESCRIPTION:
${technicalKeywords}

Please provide specific, actionable suggestions to improve this resume for ATS compatibility. Focus on:
1. Missing critical keywords that should be added and WHERE to add them
2. Specific places in the resume where keywords should be incorporated (mention actual sections/bullets)
3. How to naturally integrate missing technologies into existing experience descriptions
4. Resume structure improvements based on the actual content
5. Content enhancements that reference specific parts of the resume

IMPORTANT: Do NOT suggest adding a professional summary section. Focus on improving existing sections like experience, skills, and education.

Be specific and reference actual content from the resume when possible. Provide concrete examples.

Format your response as JSON with this exact structure:
{
  "suggestions": [
    {
      "type": "missing_keywords" | "keyword_placement" | "content_improvement" | "structure",
      "priority": "high" | "medium" | "low",
      "title": "Short descriptive title",
      "description": "Detailed explanation of the issue",
      "items": ["specific keyword 1", "specific keyword 2"],
      "action": "Specific actionable advice with examples",
      "example": "Example of how to implement this suggestion (optional)"
    }
  ]
}

Return ONLY valid JSON, no other text.`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Cost-effective model
            messages: [
                {
                    role: "system",
                    content: "You are an expert resume optimization consultant specializing in ATS systems. Always respond with valid JSON only."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" },
            max_tokens: 1500
        });

        const responseText = completion.choices[0].message.content;
        console.log('AI Analyzer: Raw response length:', responseText.length);
        console.log('AI Analyzer: Raw response preview:', responseText.substring(0, 200));
        
        let response;
        try {
            response = JSON.parse(responseText);
        } catch (parseError) {
            console.error('AI Analyzer: JSON parse error:', parseError.message);
            console.error('AI Analyzer: Response text:', responseText);
            return [];
        }
        
        // Validate and return suggestions
        if (response && Array.isArray(response.suggestions)) {
            const validSuggestions = response.suggestions.filter(s => 
                s.title && s.description && s.action
            );
            console.log(`AI Analyzer: Generated ${validSuggestions.length} valid AI suggestions out of ${response.suggestions.length} total`);
            if (validSuggestions.length > 0) {
                console.log('AI Analyzer: First suggestion title:', validSuggestions[0].title);
            }
            return validSuggestions;
        }
        
        console.log('AI Analyzer: Response structure invalid. Response keys:', Object.keys(response || {}));
        return [];
    } catch (error) {
        console.error('AI suggestion generation error:', error);
        console.error('Error details:', {
            message: error.message,
            status: error.status,
            code: error.code,
            type: error.type
        });
        // Return empty array on error - will fall back to rule-based suggestions
        return [];
    }
}

module.exports = {
    generateAISuggestions
};

