// API Configuration
const API_CONFIG = {
    // Production backend URL (your EC2 public IP or domain)
    PRODUCTION_API_URL: 'http://18.218.178.212',
    // Development backend URL
    DEVELOPMENT_API_URL: 'http://localhost:3000'
};

// Determine which URL to use
window.getApiUrl = function() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return API_CONFIG.DEVELOPMENT_API_URL;
    }
    return API_CONFIG.PRODUCTION_API_URL;
};


