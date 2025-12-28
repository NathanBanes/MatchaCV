# How to Test Vercel Proxy from Browser Console

## Step-by-Step Instructions

### 1. Open Your Vercel Site
- Navigate to your deployed Vercel URL in your browser
- Example: `https://matcha-cv.vercel.app` or your custom domain

### 2. Open Browser Console

**Chrome/Edge:**
- Press `F12` OR
- Press `Ctrl+Shift+J` (Windows) / `Cmd+Option+J` (Mac) OR
- Right-click page → "Inspect" → Click "Console" tab

**Firefox:**
- Press `F12` OR
- Press `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)

**Safari:**
- First enable Developer menu: Preferences → Advanced → Check "Show Develop menu"
- Then press `Cmd+Option+C`

### 3. Run the Test Command

In the Console tab, you'll see a prompt like `>` or `▶`. Type or paste this:

```javascript
fetch('/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

Then press **Enter**.

### 4. What to Look For

**✅ SUCCESS** - You should see something like:
```
{status: "ok", timestamp: "...", ...}
```

**❌ FAILURE** - You might see:
- `Failed to fetch` - Backend not accessible or proxy not working
- `404 Not Found` - Proxy not configured correctly
- `CORS error` - Backend CORS not configured
- `Network error` - Connection issue

### 5. Alternative Test (More Detailed)

If you want more details, try this:

```javascript
fetch('/api/health')
  .then(response => {
    console.log('Status:', response.status);
    console.log('OK:', response.ok);
    return response.json();
  })
  .then(data => {
    console.log('Response data:', data);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

### 6. Test the Analyze Endpoint

To test if the proxy works for the actual endpoint:

```javascript
fetch('/api/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
})
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
```

This should return an error (since we're not sending a file), but it will tell us if the proxy is working.

