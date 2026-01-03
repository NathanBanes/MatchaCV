// Simple test function
export default function handler(req, res) {
  res.status(200).json({ message: 'Test function works!', timestamp: new Date().toISOString() });
}

