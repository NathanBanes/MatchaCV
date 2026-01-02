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
    // For Vercel serverless functions, req is a readable stream
    // We need to collect the body chunks
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      // Check if req is a stream
      if (req.readable) {
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      } else if (req.body) {
        // If body is already parsed (for JSON), use it
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }
    
    // Prepare headers (forward important ones)
    const headers = {};
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      // Forward most headers, but skip some that Vercel/Node handles
      if (lowerKey !== 'host' && 
          lowerKey !== 'connection' && 
          lowerKey !== 'transfer-encoding' &&
          lowerKey !== 'content-encoding') {
        headers[key] = req.headers[key];
      }
    });
    
    // Forward the request to the backend
    const response = await fetch(fullUrl, {
      method: req.method,
      headers,
      body: body,
    });
    
    const data = await response.text();
    
    // Forward response headers
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Don't forward some headers that Vercel handles
      if (lowerKey !== 'content-encoding' && 
          lowerKey !== 'transfer-encoding' &&
          lowerKey !== 'connection') {
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
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      method: req.method,
      url: fullUrl,
      path: apiPath
    });
    res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
