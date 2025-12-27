const aiAnalyzer = require('./aiAnalyzer');

/**
 * Generate suggestions for resume optimization
 */
async function generateSuggestions(resumeText, jobKeywords, jobDescription, score) {
    const resumeLower = resumeText.toLowerCase();
    const suggestions = [];
    
    // Find missing critical keywords
    const missingTechnical = jobKeywords.technical.filter(keyword => 
        !resumeLower.includes(keyword) && !resumeLower.includes(keyword.replace('.', ''))
    );
    
    const missingSoftSkills = jobKeywords.softSkills.filter(skill => 
        !resumeLower.includes(skill.toLowerCase())
    );
    
    // Missing keywords suggestions
    if (missingTechnical.length > 0) {
        const topMissing = missingTechnical.slice(0, 5);
        suggestions.push({
            type: 'missing_keywords',
            priority: 'high',
            title: 'Add Missing Technical Keywords',
            description: `The job description emphasizes these technologies that are missing from your resume:`,
            items: topMissing,
            action: 'Consider adding these keywords to your skills section or incorporating them into your experience descriptions.'
        });
    }
    
    if (missingSoftSkills.length > 0) {
        suggestions.push({
            type: 'missing_soft_skills',
            priority: 'medium',
            title: 'Include Soft Skills',
            description: `The job posting mentions these soft skills:`,
            items: missingSoftSkills,
            action: 'Add these soft skills to your resume, especially in your experience bullet points and skills section.'
        });
    }
    
    // Check if skills section exists and has keywords
    const hasSkillsSection = resumeLower.includes('skill') || resumeLower.includes('technical') || resumeLower.includes('competenc');
    if (hasSkillsSection && missingTechnical.length > 3) {
        suggestions.push({
            type: 'keyword_placement',
            priority: 'medium',
            title: 'Enhance Your Skills Section',
            description: 'Your skills section could be more comprehensive.',
            items: [],
            action: 'Add missing technologies to your skills section, especially those mentioned multiple times in the job description.'
        });
    }
    
    // General resume best practices
    const wordCount = resumeText.split(/\s+/).length;
    if (wordCount < 200) {
        suggestions.push({
            type: 'general',
            priority: 'medium',
            title: 'Expand Your Resume Content',
            description: 'Your resume appears to be quite brief.',
            items: [],
            action: 'Add more detail to your experience descriptions, including specific achievements and technologies used.'
        });
    }
    
    // Check for quantifiable achievements
    const hasNumbers = /\d+/.test(resumeText);
    if (!hasNumbers) {
        suggestions.push({
            type: 'general',
            priority: 'medium',
            title: 'Add Quantifiable Achievements',
            description: 'Resumes with numbers and metrics stand out to ATS systems and recruiters.',
            items: [],
            action: 'Include metrics like "increased performance by 30%", "managed team of 5", "served 10,000+ users", etc.'
        });
    }
    
    // Check for action verbs
    const actionVerbs = ['developed', 'created', 'implemented', 'designed', 'built', 'managed', 'led', 'improved', 'optimized', 'delivered'];
    const hasActionVerbs = actionVerbs.some(verb => resumeLower.includes(verb));
    if (!hasActionVerbs) {
        suggestions.push({
            type: 'general',
            priority: 'low',
            title: 'Use Strong Action Verbs',
            description: 'Start your bullet points with action verbs to make your resume more impactful.',
            items: [],
            action: 'Use verbs like: Developed, Created, Implemented, Designed, Built, Managed, Led, Improved, Optimized, Delivered'
        });
    }
    
    // Check resume length
    if (wordCount > 800) {
        suggestions.push({
            type: 'general',
            priority: 'low',
            title: 'Consider Resume Length',
            description: 'Your resume might be too long for optimal ATS parsing.',
            items: [],
            action: 'Try to keep your resume to 1-2 pages. Focus on the most relevant experience and skills.'
        });
    }
    
    // Experience section suggestions
    const experienceKeywords = ['experience', 'employment', 'work history', 'professional experience'];
    const hasExperience = experienceKeywords.some(keyword => resumeLower.includes(keyword));
    if (hasExperience && missingTechnical.length > 0) {
        suggestions.push({
            type: 'keyword_placement',
            priority: 'high',
            title: 'Incorporate Keywords in Experience Descriptions',
            description: 'Add missing technologies to your job descriptions.',
            items: [],
            action: 'When describing your past roles, naturally incorporate the technologies and skills mentioned in the job description.'
        });
    }
    
    // Get AI-powered suggestions if API key is available
    try {
        console.log('Suggestion Generator: Attempting to get AI suggestions...');
        const aiSuggestions = await aiAnalyzer.generateAISuggestions(
            resumeText,
            jobDescription,
            jobKeywords,
            score ? score.overallScore : 0
        );
        
        // Add AI suggestions (they're more personalized, so add them first)
        if (aiSuggestions && aiSuggestions.length > 0) {
            console.log(`Suggestion Generator: Adding ${aiSuggestions.length} AI suggestions`);
            // Merge AI suggestions with rule-based ones, prioritizing AI
            return [...aiSuggestions, ...suggestions];
        } else {
            console.log('Suggestion Generator: No AI suggestions returned, using rule-based only');
        }
    } catch (error) {
        console.error('Error getting AI suggestions, using fallback:', error.message);
        console.error('Full error:', error);
        // Continue with rule-based suggestions if AI fails
    }
    
    return suggestions;
}

module.exports = {
    generateSuggestions
};

