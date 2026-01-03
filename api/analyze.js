// Proxy /api/analyze requests to EC2 backend
export default async function handler(req, res) {
  console.log('[Analyze] Function invoked:', {
    method: req.method,
    url: req.url
  });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const backendUrl = 'http://18.218.178.212:3000/api/analyze';
  
  try {
    // Read request body as stream for FormData
    let body = null;
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
    
    // Prepare headers to forward (important for FormData)
    const headers = {};
    const skipHeaders = ['host', 'connection', 'transfer-encoding', 'content-encoding'];
    
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!skipHeaders.includes(lowerKey)) {
        headers[key] = req.headers[key];
      }
    });
    
    
    // Make request to backend
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body: body
    });
    
    // Get response data
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
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
      res.json(data);
    } else {
      res.send(data);
    }
    
  } catch (error) {
    console.error('[Analyze] Error:', error);
    console.error('[Analyze] Error details:', {
      message: error.message,
      stack: error.stack
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message
    });
  }
}

