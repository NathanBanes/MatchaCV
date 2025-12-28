// Vercel serverless function to proxy requests to EC2 backend
export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  const { path } = req.query;
  
  // Get the full path from the request
  const apiPath = Array.isArray(path) ? path.join('/') : path || '';
  const backendUrl = `http://18.218.178.212:3000/api/${apiPath}`;
  
  // Forward query parameters (excluding 'path')
  const queryParams = { ...req.query };
  delete queryParams.path;
  const queryString = new URLSearchParams(queryParams).toString();
  const fullUrl = queryString ? `${backendUrl}?${queryString}` : backendUrl;
  
  try {
    // Prepare headers
    const headers = {};
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    
    // Prepare body
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // For FormData, we need to pass the raw body
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // Vercel automatically parses FormData, but we need to reconstruct it
        // For now, pass the raw body buffer if available
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
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

