const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Parse resume file and extract text content
 * @param {string} filePath - Path to the resume file
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} - Extracted text content
 */
async function parseResume(filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    
    try {
        if (ext === '.pdf') {
            return await parsePDF(filePath);
        } else if (ext === '.docx') {
            return await parseDOCX(filePath);
        } else if (ext === '.doc') {
            // DOC files are harder to parse, for now we'll return an error
            // In production, you might want to use a library like antiword or LibreOffice
            throw new Error('DOC files are not currently supported. Please convert to PDF or DOCX.');
        } else {
            throw new Error('Unsupported file format');
        }
    } catch (error) {
        throw new Error(`Failed to parse resume: ${error.message}`);
    }
}

/**
 * Parse PDF file
 */
async function parsePDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
}

/**
 * Parse DOCX file
 */
async function parseDOCX(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
}

/**
 * Extract sections from resume text (basic implementation)
 */
function extractSections(resumeText) {
    const sections = {
        skills: [],
        experience: [],
        education: [],
        summary: ''
    };

    const lines = resumeText.split('\n').map(line => line.trim()).filter(line => line);
    
    let currentSection = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        
        if (line.includes('skill') || line.includes('technical') || line.includes('competenc')) {
            currentSection = 'skills';
        } else if (line.includes('experience') || line.includes('employment') || line.includes('work history')) {
            currentSection = 'experience';
        } else if (line.includes('education') || line.includes('academic')) {
            currentSection = 'education';
        } else if (line.includes('summary') || line.includes('objective') || line.includes('profile')) {
            currentSection = 'summary';
        } else if (currentSection && lines[i]) {
            if (currentSection === 'skills') {
                // Extract skills (comma or line separated)
                const skills = lines[i].split(/[,;•\-\n]/).map(s => s.trim()).filter(s => s);
                sections.skills.push(...skills);
            } else if (currentSection === 'experience') {
                sections.experience.push(lines[i]);
            } else if (currentSection === 'education') {
                sections.education.push(lines[i]);
            } else if (currentSection === 'summary') {
                sections.summary += lines[i] + ' ';
            }
        }
    }

    return sections;
}

module.exports = {
    parseResume,
    extractSections
};

