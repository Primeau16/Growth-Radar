const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CLAUDE ENDPOINT (unchanged) ──
app.post('/api/claude', async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured.' });
  try {
    const { prompt, useSearch } = req.body;
    const fullPrompt = `You are a senior investment analyst. IMPORTANT: Your final response must be ONLY valid JSON. No markdown. No backticks. No explanation. Just raw JSON starting with [ or {.\n\n${prompt}`;
    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: fullPrompt }]
    };
    if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
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
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    res.json({ text });
  } catch (err) {
    console.error('Claude error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PRICE ENDPOINT (Twelve Data) ──
// POST /api/prices  body: { symbols: ["NVDA","BTC/USD","SPY"] }
// returns: { prices: { "NVDA": {price, change, percent_change, currency}, ... } }
app.post('/api/prices', async (req, res) => {
  if (!TWELVE_DATA_KEY) return res.status(500).json({ error: 'Price API key not configured. Add TWELVE_DATA_KEY in Railway.' });
  try {
    const { symbols } = req.body;
    if (!symbols || !symbols.length) return res.json({ prices: {} });

    // Twelve Data accepts comma-separated symbols in a single call (batched = 1 credit each)
    const symbolParam = symbols.map(s => encodeURIComponent(s)).join(',');
    const url = `https://api.twelvedata.com/quote?symbol=${symbolParam}&apikey=${TWELVE_DATA_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    const prices = {};

    // Single symbol returns an object; multiple returns keyed-by-symbol object
    const normalize = (sym, q) => {
      if (!q || q.code || q.status === 'error') return; // skip errors
      const price = parseFloat(q.close ?? q.price);
      if (isNaN(price)) return;
      prices[sym] = {
        price,
        change: parseFloat(q.change) || 0,
        percent_change: parseFloat(q.percent_change) || 0,
        currency: q.currency || 'USD',
        name: q.name || sym
      };
    };

    if (symbols.length === 1) {
      normalize(symbols[0], data);
    } else {
      for (const sym of symbols) {
        normalize(sym, data[sym]);
      }
    }

    res.json({ prices });
  } catch (err) {
    console.error('Price error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── TIME SERIES ENDPOINT (for real portfolio chart history) ──
// POST /api/history  body: { symbol: "NVDA", interval: "1day", outputsize: 30 }
app.post('/api/history', async (req, res) => {
  if (!TWELVE_DATA_KEY) return res.status(500).json({ error: 'Price API key not configured.' });
  try {
    const { symbol, interval = '1day', outputsize = 30 } = req.body;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.code || data.status === 'error') return res.status(400).json({ error: data.message || 'History unavailable' });
    // values come newest-first; reverse to oldest-first for charting
    const values = (data.values || []).map(v => ({ datetime: v.datetime, close: parseFloat(v.close) })).reverse();
    res.json({ symbol, values });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`GrowthRadar running on port ${PORT}`));
