// Test endpoint to verify Vercel functions work
export default async function handler(req, res) {
  console.log('[Health] Function invoked');
  
  // Proxy to EC2 backend
  try {
    const response = await fetch('http://18.218.178.212:3000/api/health');
    const data = await response.json();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (error) {
    console.error('[Health] Error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message 
    });
  }
}

