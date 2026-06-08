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
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }
  try {
    const { prompt, useSearch } = req.body;
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: 'You are a senior investment analyst. Always respond with valid raw JSON only. Never use markdown, backticks, or any text outside the JSON. Start directly with [ or { and end with ] or }.',
      messages: [{ role: 'user', content: prompt }]
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
    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'API error' });
    }
    const text = (data.content || []).map(b => b.type === 'text' ? b.text : '').join('');
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`GrowthRadar running on port ${PORT}`));
