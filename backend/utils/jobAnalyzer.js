const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extract job description from URL
 */
async function extractFromUrl(url) {
    try {
        // Validate URL format
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided');
        }
        
        // Ensure URL has protocol
        let fullUrl = url.trim();
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            fullUrl = 'https://' + fullUrl;
        }
        
        const response = await axios.get(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            timeout: 15000, // Increased timeout to 15 seconds
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept redirects
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Remove script, style, and other non-content elements
        $('script, style, nav, header, footer, aside, .nav, .header, .footer, .sidebar, .menu').remove();
        
        // Try to find job description in common selectors (expanded list)
        let jobText = '';
        const selectors = [
            // Workable-specific
            '[class*="job-description"]',
            '[class*="job-details"]',
            '[class*="job-content"]',
            '[data-testid*="job"]',
            // Generic job board selectors
            '[class*="description"]',
            '[id*="job-description"]',
            '[id*="description"]',
            '[id*="job-details"]',
            '[class*="job-posting"]',
            '[class*="posting"]',
            // Common content containers
            'article',
            '.content',
            '.main-content',
            'main',
            '[role="main"]',
            '.job-content',
            '.posting-content'
        ];
        
        for (const selector of selectors) {
            const element = $(selector).first();
            if (element.length) {
                const text = element.text().trim();
                // Check if we found substantial content (at least 200 chars)
                if (text.length > 200) {
                    jobText = text;
                    break;
                }
            }
        }
        
        // Fallback to body text if no specific selector found
        if (!jobText || jobText.length < 200) {
            // Remove common noise elements before extracting body text
            $('.cookie-banner, .popup, .modal, .overlay, .advertisement, .ad, [class*="cookie"], [class*="popup"], [class*="modal"]').remove();
            jobText = $('body').text().trim();
        }
        
        // Clean up the text (remove excessive whitespace)
        jobText = jobText.replace(/\s+/g, ' ').trim();
        
        if (!jobText || jobText.length < 50) {
            throw new Error('Could not extract sufficient content from the URL. The page may require JavaScript to load content, or the job description may not be publicly accessible. Please try pasting the job description text instead.');
        }
        
        return jobText;
    } catch (error) {
        // Handle specific error types
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            throw new Error(`Cannot connect to the URL. Please check that the URL is correct and accessible. Error: ${error.message}`);
        }
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            throw new Error(`Request timed out while fetching the URL. The website may be slow or blocking requests. Please try pasting the job description text instead.`);
        }
        if (error.response && error.response.status === 403) {
            throw new Error(`Access denied (403). The website may be blocking automated requests. Please try pasting the job description text instead.`);
        }
        if (error.response && error.response.status === 404) {
            throw new Error(`Page not found (404). Please check that the URL is correct.`);
        }
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

