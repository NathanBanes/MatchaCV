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
  const pathSegments = req.query.path || [];
  const apiPath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;
  const backendUrl = `http://18.218.178.212:3000/api/${apiPath}`;
  
  // Forward query parameters (excluding 'path')
  const queryParams = { ...req.query };
  delete queryParams.path;
  const queryString = new URLSearchParams(queryParams).toString();
  const fullUrl = queryString ? `${backendUrl}?${queryString}` : backendUrl;
  
  console.log(`[Proxy] ${req.method} ${apiPath} -> ${fullUrl}`);
  
  try {
    // Read request body as stream for all methods except GET/HEAD
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        // Vercel serverless functions: req is a readable stream
        const chunks = [];
        if (typeof req.on === 'function') {
          // It's a stream - collect chunks
          await new Promise((resolve, reject) => {
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', resolve);
            req.on('error', reject);
          });
          body = Buffer.concat(chunks);
        } else if (req.body) {
          // Body already available
          if (Buffer.isBuffer(req.body)) {
            body = req.body;
          } else if (typeof req.body === 'string') {
            body = Buffer.from(req.body);
          } else {
            body = Buffer.from(JSON.stringify(req.body));
          }
        }
      } catch (bodyError) {
        console.error('Error reading request body:', bodyError);
        // Continue without body - might work for some requests
      }
    }
    
    // Prepare headers to forward
    const headers = {};
    const skipHeaders = ['host', 'connection', 'transfer-encoding', 'content-encoding', 'content-length'];
    
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!skipHeaders.includes(lowerKey)) {
        headers[key] = req.headers[key];
      }
    });
    
    // Make request to backend
    const fetchOptions = {
      method: req.method,
      headers,
    };
    
    if (body && body.length > 0) {
      fetchOptions.body = body;
    }
    
    console.log(`[Proxy] Forwarding to backend: ${req.method} ${fullUrl}`);
    const response = await fetch(fullUrl, fetchOptions);
    
    // Get response data
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
      data = JSON.stringify(data);
    } else {
      data = await response.text();
    }
    
    // Forward response headers
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(lowerKey)) {
        res.setHeader(key, value);
      }
    });
    
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Send response
    res.status(response.status);
    if (contentType.includes('application/json')) {
      res.json(JSON.parse(data));
    } else {
      res.send(data);
    }
    
  } catch (error) {
    console.error('[Proxy] Error:', error);
    console.error('[Proxy] Error details:', {
      message: error.message,
      stack: error.stack,
      method: req.method,
      url: fullUrl,
      path: apiPath,
      hasBody: !!body,
      bodyLength: body ? body.length : 0
    });
    
    res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message,
      path: apiPath,
      backendUrl: fullUrl
    });
  }
}
