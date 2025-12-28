# Test Backend Connection

## Quick Tests

### 1. Test from Browser Console (on your Vercel site)

Open browser console (F12) and run:

```javascript
// Test health endpoint
fetch('/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(e => console.error('Error:', e))

// Test analyze endpoint (will fail without file, but should get different error)
fetch('/api/analyze', { method: 'POST' })
  .then(r => r.text())
  .then(console.log)
  .catch(e => console.error('Error:', e))
```

### 2. Test Backend Directly (from your local machine)

```bash
# Test if backend is accessible
curl http://18.218.178.212:3000/api/health

# Should return: {"status":"ok",...}
```

### 3. Check Backend is Running (on EC2)

```bash
# SSH to EC2 first
ssh -i ~/Downloads/matchacv-backend.pem ec2-user@18.218.178.212

# Then check PM2
pm2 status

# Check if port 3000 is listening
sudo netstat -tlnp | grep 3000

# Test locally on EC2
curl http://localhost:3000/api/health

# Check logs
pm2 logs matchacv-server --lines 20
```

### 4. Check Security Group

**EC2 Security Group must allow:**
- **Inbound:** Custom TCP port 3000 from 0.0.0.0/0
- **Inbound:** HTTP port 80 from 0.0.0.0/0 (if using Nginx)

### 5. Check Vercel Proxy

The `vercel.json` should proxy `/api/*` to your EC2 backend. If it's not working:

**Option A: Use direct URL (bypass proxy)**
Update `frontend/config.js`:
```javascript
PRODUCTION_API_URL: 'http://18.218.178.212:3000'
```

**Option B: Fix Vercel proxy**
Make sure `vercel.json` is in the root directory and has correct format.

### 6. Check CORS on Backend

**On EC2, verify `.env` has:**
```
FRONTEND_URL=https://matcha-cv.vercel.app
```

**Then restart:**
```bash
pm2 restart all
```

