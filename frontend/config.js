// API Configuration
const API_CONFIG = {
    // Production: Use relative URLs - Vercel will proxy to EC2 backend
    // This avoids mixed content issues (HTTPS frontend -> HTTP backend)
    PRODUCTION_API_URL: '',  // Empty = use same origin (Vercel will proxy via vercel.json)
    // Development backend URL
    DEVELOPMENT_API_URL: 'http://localhost:3000'
};

// Determine which URL to use
window.getApiUrl = function() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return API_CONFIG.DEVELOPMENT_API_URL;
    }
    // In production, use empty string so requests go to same origin (Vercel)
    // Vercel will proxy /api/* requests to EC2 backend via vercel.json
    return API_CONFIG.PRODUCTION_API_URL;
};


