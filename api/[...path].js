// Vercel serverless function to proxy ALL /api/* requests to EC2 backend
// This catch-all route handles all API endpoints including file uploads

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Get the path from the catch-all route
  // In Vercel, the path segments are in req.query.path as an array
  const pathSegments = req.query.path || [];
  const apiPath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;
  const backendUrl = `http://18.218.178.212:3000/api/${apiPath}`;
  
  // Forward query parameters (excluding 'path')
  const queryParams = { ...req.query };
  delete queryParams.path;
  const queryString = new URLSearchParams(queryParams).toString();
  const fullUrl = queryString ? `${backendUrl}?${queryString}` : backendUrl;
  
  try {
    // Prepare headers (forward important ones, but let fetch handle Content-Type for FormData)
    const headers = {};
    
    // Forward all headers except host and connection-related ones
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'host' && lowerKey !== 'connection' && lowerKey !== 'content-length') {
        headers[key] = req.headers[key];
      }
    });
    
    // For GET/HEAD requests, no body needed
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // For FormData (multipart), we need to get the raw body
      // Vercel parses FormData, but we can access raw body via req.body if available
      // Otherwise, we'll need to reconstruct it
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // For FormData, we need to pass the request stream
        // But Vercel might have already parsed it, so we'll try to get raw body
        body = req.body;
      } else {
        // For JSON, stringify if it's an object
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      }
    }
    
    // Forward the request to the backend
    const response = await fetch(fullUrl, {
      method: req.method,
      headers,
      body,
    });
    
    const data = await response.text();
    
    // Forward response headers
    response.headers.forEach((value, key) => {
      // Don't forward some headers that Vercel handles
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Forward status code
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message 
    });
  }
}
