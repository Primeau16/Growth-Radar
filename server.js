const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/claude', async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured.' });
  try {
    const { prompt, useSearch } = req.body;

    // Build messages — no system prompt when using tools (causes issues)
    const fullPrompt = `You are a senior investment analyst. IMPORTANT: Your final response must be ONLY valid JSON. No markdown. No backticks. No explanation. Just raw JSON starting with [ or {.\n\n${prompt}`;

    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: fullPrompt }]
    };

    if (useSearch) {
      body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message || 'API error' });

    // Extract ALL text blocks — including after tool use
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    console.log('Response length:', text.length);
    console.log('First 200 chars:', text.slice(0, 200));

    res.json({ text });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`GrowthRadar running on port ${PORT}`));
