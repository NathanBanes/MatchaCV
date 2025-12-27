const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extract job description from URL
 */
async function extractFromUrl(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        // Remove script and style elements
        $('script, style').remove();
        
        // Try to find job description in common selectors
        let jobText = '';
        const selectors = [
            '[class*="job-description"]',
            '[class*="job-details"]',
            '[class*="description"]',
            '[id*="job-description"]',
            '[id*="description"]',
            'article',
            '.content',
            'main'
        ];
        
        for (const selector of selectors) {
            const element = $(selector).first();
            if (element.length && element.text().trim().length > 200) {
                jobText = element.text().trim();
                break;
            }
        }
        
        // Fallback to body text if no specific selector found
        if (!jobText || jobText.length < 200) {
            jobText = $('body').text().trim();
        }
        
        if (!jobText || jobText.trim().length < 50) {
            throw new Error('Could not extract sufficient content from the URL. Please try pasting the job description text instead.');
        }
        
        return jobText;
    } catch (error) {
        if (error.message.includes('Could not extract')) {
            throw error;
        }
        throw new Error(`Failed to fetch job description from URL: ${error.message}. Please try pasting the job description text instead.`);
    }
}

/**
 * Extract keywords from job description
 */
function extractKeywords(jobDescription) {
    const text = jobDescription.toLowerCase();
    
    // Common technical skills keywords
    const technicalKeywords = [
        'javascript', 'python', 'java', 'react', 'node.js', 'sql', 'aws', 'docker', 'kubernetes',
        'typescript', 'angular', 'vue', 'html', 'css', 'mongodb', 'postgresql', 'redis',
        'git', 'github', 'ci/cd', 'terraform', 'jenkins', 'agile', 'scrum', 'rest api',
        'graphql', 'microservices', 'machine learning', 'ai', 'data science', 'tableau',
        'excel', 'salesforce', 'azure', 'gcp', 'linux', 'bash', 'powershell', 'php',
        'ruby', 'go', 'rust', 'swift', 'kotlin', 'c++', 'c#', '.net', 'spring boot',
        'django', 'flask', 'express', 'next.js', 'vue.js', 'svelte', 'webpack', 'babel'
    ];
    
    // Soft skills keywords
    const softSkills = [
        'leadership', 'communication', 'teamwork', 'problem-solving', 'analytical',
        'collaboration', 'management', 'mentoring', 'presentation', 'negotiation',
        'strategic thinking', 'project management', 'agile', 'scrum', 'kanban'
    ];
    
    // Experience level keywords
    const experienceKeywords = [
        'years of experience', 'years experience', 'senior', 'junior', 'mid-level',
        'entry level', 'experienced', 'expert', 'proficient', 'familiar'
    ];
    
    // Education/qualification keywords
    const educationKeywords = [
        'bachelor', 'master', 'phd', 'degree', 'certification', 'certified',
        'diploma', 'university', 'college', 'education', 'qualification'
    ];
    
    // Extract found keywords
    const foundTechnical = technicalKeywords.filter(keyword => 
        text.includes(keyword) || text.includes(keyword.replace('.', ''))
    );
    
    const foundSoftSkills = softSkills.filter(skill => 
        text.includes(skill.toLowerCase())
    );
    
    const foundExperience = experienceKeywords.filter(exp => 
        text.includes(exp.toLowerCase())
    );
    
    const foundEducation = educationKeywords.filter(edu => 
        text.includes(edu.toLowerCase())
    );
    
    // Extract additional keywords (words that appear frequently)
    const words = text.split(/\s+/).filter(word => word.length > 3);
    const wordFreq = {};
    words.forEach(word => {
        const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
        if (cleanWord.length > 3) {
            wordFreq[cleanWord] = (wordFreq[cleanWord] || 0) + 1;
        }
    });
    
    // Get most frequent words (excluding common stop words)
    const stopWords = new Set([
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
        'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
        'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'way', 'use',
        'your', 'work', 'with', 'this', 'that', 'from', 'they', 'have', 'been',
        'will', 'more', 'what', 'when', 'where', 'which', 'their', 'there', 'these',
        'those', 'about', 'above', 'after', 'again', 'below', 'between', 'during',
        'before', 'under', 'while', 'through', 'within', 'without'
    ]);
    
    const frequentWords = Object.entries(wordFreq)
        .filter(([word]) => !stopWords.has(word))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([word]) => word);
    
    return {
        technical: foundTechnical,
        softSkills: foundSoftSkills,
        experience: foundExperience,
        education: foundEducation,
        frequent: frequentWords,
        all: [...foundTechnical, ...foundSoftSkills, ...frequentWords]
    };
}

module.exports = {
    extractFromUrl,
    extractKeywords
};

