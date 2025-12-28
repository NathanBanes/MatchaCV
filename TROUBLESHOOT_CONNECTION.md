# Troubleshooting "Load failed" Error

## The Problem
Your frontend on Vercel (HTTPS) is trying to connect to your backend on EC2 (HTTP). Modern browsers **block mixed content** - HTTPS pages cannot make requests to HTTP endpoints.

## Quick Test

**Open browser console (F12) and run:**
```javascript
fetch('http://18.218.178.212:3000/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(e => console.error('Error:', e))
```

**If you see a mixed content error**, that's the problem.

## Solutions

### Option 1: Use Nginx with HTTPS (Recommended for Production)

1. **Get a free SSL certificate with Let's Encrypt:**
   ```bash
   # On EC2
   sudo dnf install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

2. **Or use AWS Certificate Manager + Application Load Balancer**

### Option 2: Use HTTP Backend URL (Quick Fix for Testing)

**Change `frontend/config.js`:**
```javascript
PRODUCTION_API_URL: 'http://18.218.178.212:3000'
```

**But this will still be blocked by browsers from HTTPS pages.**

### Option 3: Use Vercel Proxy (Easiest Quick Fix)

Create `vercel.json` in your project root:
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "http://18.218.178.212:3000/api/:path*"
    }
  ]
}
```

Then update `frontend/config.js`:
```javascript
PRODUCTION_API_URL: ''  // Use relative URLs - Vercel will proxy
```

### Option 4: Test Locally First

Test with HTTP frontend locally to verify backend works:
```bash
# Run frontend locally (HTTP)
cd frontend
python3 -m http.server 8080
# Visit http://localhost:8080
```

## Check Backend is Running

**On EC2, verify:**
```bash
# Check PM2 status
pm2 status

# Check if port 3000 is listening
sudo netstat -tlnp | grep 3000

# Test locally on EC2
curl http://localhost:3000/api/health

# Check logs
pm2 logs matchacv-server --lines 20
```

## Check Security Group

**EC2 Security Group must allow:**
- **Inbound:** Custom TCP port 3000 from 0.0.0.0/0
- **Inbound:** HTTP port 80 from 0.0.0.0/0 (if using Nginx)

## Check CORS

**On EC2, verify `.env` has:**
```
FRONTEND_URL=https://matcha-cv.vercel.app
```

**Then restart:**
```bash
pm2 restart all
```

