const fs = require('fs');
// Try reading the API key from Vercel env or .env files (none expected here, but try anyway)
const key = process.env.GEMINI_API_KEY || '';
if (!key) {
  console.log('No GEMINI_API_KEY set — skipping live model list');
  process.exit(0);
}
