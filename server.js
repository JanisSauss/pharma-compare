require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { searchAll } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

const cache = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 stunda

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'PharmaCompare darbojas!' });
});

app.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (query.length < 2) return res.status(400).json({ error: 'Parak iss vaicajums' });

  const key = query.toLowerCase();

  if (cache[key] && Date.now() - cache[key].time < CACHE_DURATION) {
    console.log(`Cache hit: "${query}"`);
    return res.json({ results: cache[key].data, fromCache: true });
  }

  console.log(`\nJauna meklesana: "${query}"`);
  try {
    const results = await searchAll(query);
    cache[key] = { data: results, time: Date.now() };
    res.json({ results, fromCache: false, query, count: results.length, searchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Kluda:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend: http://localhost:${PORT}`);
  console.log(`Tests: http://localhost:${PORT}/search?q=ibuprofen`);
  console.log(`Uzmaniba: Playwright scraping var panemts 20-40 sekundes!`);
});
