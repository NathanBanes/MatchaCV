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
  const path = req.query.path || [];
  const apiPath = Array.isArray(path) ? path.join('/') : path;
  const backendUrl = `http://18.218.178.212:3000/api/${apiPath}`;
  
  // Forward query parameters (excluding 'path')
  const queryParams = { ...req.query };
  delete queryParams.path;
  const queryString = new URLSearchParams(queryParams).toString();
  const fullUrl = queryString ? `${backendUrl}?${queryString}` : backendUrl;
  
  try {
    // Get raw body for forwarding (needed for FormData)
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    
    // Prepare headers (forward important ones)
    const headers = {};
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    if (req.headers['content-length']) {
      headers['Content-Length'] = req.headers['content-length'];
    }
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    
    // Forward the request to the backend
    const response = await fetch(fullUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    });
    
    const data = await response.text();
    
    // Forward response headers
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
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

