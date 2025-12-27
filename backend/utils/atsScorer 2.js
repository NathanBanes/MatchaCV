/**
 * Calculate ATS compatibility score
 */
function calculateScore(resumeText, jobKeywords) {
    const resumeLower = resumeText.toLowerCase();
    
    // Count matches for each category
    const technicalMatches = jobKeywords.technical.filter(keyword => 
        resumeLower.includes(keyword) || resumeLower.includes(keyword.replace('.', ''))
    ).length;
    
    const softSkillMatches = jobKeywords.softSkills.filter(skill => 
        resumeLower.includes(skill.toLowerCase())
    ).length;
    
    const educationMatches = jobKeywords.education.filter(edu => 
        resumeLower.includes(edu.toLowerCase())
    ).length;
    
    // Calculate match percentages
    const technicalScore = jobKeywords.technical.length > 0 
        ? (technicalMatches / jobKeywords.technical.length) * 100 
        : 0;
    
    const softSkillScore = jobKeywords.softSkills.length > 0 
        ? (softSkillMatches / jobKeywords.softSkills.length) * 100 
        : 0;
    
    const educationScore = jobKeywords.education.length > 0 
        ? (educationMatches / jobKeywords.education.length) * 100 
        : 0;
    
    // Count overall keyword matches
    const allMatches = jobKeywords.all.filter(keyword => 
        resumeLower.includes(keyword.toLowerCase())
    ).length;
    
    const overallKeywordScore = jobKeywords.all.length > 0 
        ? (allMatches / jobKeywords.all.length) * 100 
        : 0;
    
    // Apply weighted scoring
    // Technical skills: 40%, Soft skills: 20%, Education: 10%, Overall keywords: 30%
    const weightedScore = 
        (technicalScore * 0.4) + 
        (softSkillScore * 0.2) + 
        (educationScore * 0.1) + 
        (overallKeywordScore * 0.3);
    
    // Round to 2 decimal places
    const finalScore = Math.round(weightedScore * 100) / 100;
    
    return {
        overallScore: Math.min(100, Math.max(0, finalScore)),
        technicalScore: Math.round(technicalScore * 100) / 100,
        softSkillScore: Math.round(softSkillScore * 100) / 100,
        educationScore: Math.round(educationScore * 100) / 100,
        keywordMatches: allMatches,
        totalKeywords: jobKeywords.all.length,
        breakdown: {
            technical: {
                matched: technicalMatches,
                total: jobKeywords.technical.length,
                percentage: Math.round(technicalScore * 100) / 100
            },
            softSkills: {
                matched: softSkillMatches,
                total: jobKeywords.softSkills.length,
                percentage: Math.round(softSkillScore * 100) / 100
            },
            education: {
                matched: educationMatches,
                total: jobKeywords.education.length,
                percentage: Math.round(educationScore * 100) / 100
            }
        }
    };
}

module.exports = {
    calculateScore
};

