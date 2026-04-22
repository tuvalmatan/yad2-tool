const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// On Render: use /tmp (writable). Locally: use ./data
const DATA_DIR = process.env.RENDER ? '/tmp/yad2-data' : path.join(__dirname, '../data');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const HISTORY_FILE = path.join(DATA_DIR, 'price_history.json');
const SEEN_FILE = path.join(DATA_DIR, 'seen_ads.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// CORS: allow your Render domain + localhost dev
const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /^https:\/\/.*\.onrender\.com$/,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow server-to-server / curl
    const ok = allowedOrigins.some(p => typeof p === 'string' ? p === origin : p.test(origin));
    cb(ok ? null : new Error('CORS'), ok);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return fallback;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const YAD2_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
  'Referer': 'https://www.yad2.co.il/',
  'Origin': 'https://www.yad2.co.il',
};

// Map our category names to yad2 API paths
const CATEGORY_MAP = {
  motorcycles: 'motorcycles',
  scooters: 'scooters',
  cars: 'cars',
};

// License type → engine volume ranges (cc)
const LICENSE_CC = {
  A:  { min: 501, max: 99999 },
  A1: { min: 126, max: 500 },
  A2: { min: 0,   max: 125 },
};

function filterByLicense(items, licenseType) {
  if (!licenseType || !LICENSE_CC[licenseType]) return items;
  const { min, max } = LICENSE_CC[licenseType];
  return items.filter(item => {
    const cc = parseInt(item.EngineVolume || item.engine_volume || item.engineVolume || 0);
    if (!cc) return true; // keep items with no cc data
    return cc >= min && cc <= max;
  });
}

function normalizeItem(item) {
  return {
    id: item.id || item.orderId || String(Math.random()),
    title: item.title || `${item.manufacturer_he || ''} ${item.model_name || item.SubModel || ''}`.trim(),
    manufacturer: item.manufacturer_he || item.manufacturer || '',
    model: item.model_name || item.SubModel || '',
    price: parseInt(item.price || item.Price || 0),
    year: parseInt(item.year || item.Year || 0),
    km: parseInt(item.km || item.Km || 0),
    hand: item.hand || item.Hand || '',
    engineCC: parseInt(item.EngineVolume || item.engine_volume || 0),
    city: item.city || item.area_name || '',
    image: item.images?.main_image || item.thumbnail || item.pic_url || '',
    link: item.link_token ? `https://www.yad2.co.il/item/${item.link_token}` : '',
    date: item.date || item.updated_at || '',
    isNew: item.is_new_ad || false,
  };
}

// ─── Search Proxy ──────────────────────────────────────────────────────────────

app.get('/api/search', async (req, res) => {
  try {
    const {
      category = 'motorcycles',
      manufacturer, model,
      yearFrom, yearTo,
      priceMax, kmMax,
      licenseType,
      page = 1,
    } = req.query;

    const apiCategory = CATEGORY_MAP[category] || 'motorcycles';
    const params = new URLSearchParams();

    if (manufacturer) params.set('manufacturer', manufacturer);
    if (model)        params.set('model', model);
    if (yearFrom)     params.set('year', yearFrom);
    if (yearTo)       params.set('topYear', yearTo);
    if (priceMax)     params.set('price', priceMax);
    if (kmMax)        params.set('km', kmMax);
    params.set('page', page);
    params.set('Order', '1');

    const url = `https://gw.yad2.co.il/feed-search-legacy/vehicles/${apiCategory}?${params}`;
    const yad2Res = await fetch(url, { headers: YAD2_HEADERS, timeout: 15000 });

    if (!yad2Res.ok) throw new Error(`Yad2 returned ${yad2Res.status}`);

    const data = await yad2Res.json();
    let items = data.data?.feed?.feed_items
      || data.feed?.feed_items
      || data.data?.rows
      || [];

    // filter out non-listing items (banners etc.)
    items = items.filter(i => i.type !== 'commercial_ad' && i.type !== 'banner');

    // Apply license filter client-side (yad2 doesn't support it as URL param)
    if (licenseType) items = filterByLicense(items, licenseType);

    const normalized = items.map(normalizeItem);

    // Save snapshot to price history
    const history = loadJSON(HISTORY_FILE, {});
    const today = new Date().toISOString().split('T')[0];
    normalized.forEach(item => {
      if (!item.id || !item.price) return;
      if (!history[item.id]) history[item.id] = { title: item.title, prices: [] };
      const last = history[item.id].prices.at(-1);
      if (!last || last.date !== today) {
        history[item.id].prices.push({ date: today, price: item.price });
        // Keep max 30 data points per item
        if (history[item.id].prices.length > 30) history[item.id].prices.shift();
      }
    });
    saveJSON(HISTORY_FILE, history);

    res.json({
      ok: true,
      total: data.data?.total_items || normalized.length,
      page: parseInt(page),
      items: normalized,
    });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Price History ─────────────────────────────────────────────────────────────

app.get('/api/history/:id', (req, res) => {
  const history = loadJSON(HISTORY_FILE, {});
  const entry = history[req.params.id];
  if (!entry) return res.json({ ok: false, error: 'No history for this item' });
  res.json({ ok: true, ...entry });
});

app.get('/api/history', (req, res) => {
  const history = loadJSON(HISTORY_FILE, {});
  const summary = Object.entries(history).map(([id, entry]) => ({
    id,
    title: entry.title,
    priceCount: entry.prices.length,
    firstPrice: entry.prices[0],
    lastPrice: entry.prices.at(-1),
    change: entry.prices.length > 1
      ? entry.prices.at(-1).price - entry.prices[0].price
      : 0,
  }));
  res.json({ ok: true, items: summary });
});

// ─── Alerts ────────────────────────────────────────────────────────────────────

app.get('/api/alerts', (req, res) => {
  const alerts = loadJSON(ALERTS_FILE, []);
  res.json({ ok: true, alerts });
});

app.post('/api/alerts', (req, res) => {
  const alerts = loadJSON(ALERTS_FILE, []);
  const alert = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    lastChecked: null,
    newCount: 0,
    ...req.body,
  };
  alerts.push(alert);
  saveJSON(ALERTS_FILE, alerts);
  res.json({ ok: true, alert });
});

app.delete('/api/alerts/:id', (req, res) => {
  let alerts = loadJSON(ALERTS_FILE, []);
  alerts = alerts.filter(a => a.id !== req.params.id);
  saveJSON(ALERTS_FILE, alerts);
  res.json({ ok: true });
});

// ─── Alert Check (runs every 10 min via cron + on-demand) ─────────────────────

async function checkAlerts() {
  const alerts = loadJSON(ALERTS_FILE, []);
  const seen = loadJSON(SEEN_FILE, {});
  let changed = false;

  for (const alert of alerts) {
    try {
      const params = new URLSearchParams();
      if (alert.manufacturer) params.set('manufacturer', alert.manufacturer);
      if (alert.model)        params.set('model', alert.model);
      if (alert.yearFrom)     params.set('year', alert.yearFrom);
      if (alert.priceMax)     params.set('price', alert.priceMax);
      params.set('Order', '1');

      const category = CATEGORY_MAP[alert.category || 'motorcycles'];
      const url = `https://gw.yad2.co.il/feed-search-legacy/vehicles/${category}?${params}`;
      const yad2Res = await fetch(url, { headers: YAD2_HEADERS, timeout: 10000 });
      if (!yad2Res.ok) continue;

      const data = await yad2Res.json();
      let items = data.data?.feed?.feed_items || data.feed?.feed_items || [];
      items = items.filter(i => i.type !== 'commercial_ad');
      if (alert.licenseType) items = filterByLicense(items, alert.licenseType);

      const alertSeen = seen[alert.id] || [];
      const newItems = items.filter(i => i.id && !alertSeen.includes(String(i.id)));

      alert.lastChecked = new Date().toISOString();
      alert.newCount = (alert.newCount || 0) + newItems.length;
      alert.lastNewItems = newItems.slice(0, 5).map(normalizeItem);

      if (newItems.length > 0) {
        seen[alert.id] = [...alertSeen, ...newItems.map(i => String(i.id))].slice(-500);
        changed = true;
        console.log(`[Alert] "${alert.label}" — ${newItems.length} new items`);
      }
    } catch (err) {
      console.error(`[Alert] check failed for "${alert.label}":`, err.message);
    }
  }

  if (changed) {
    saveJSON(ALERTS_FILE, alerts);
    saveJSON(SEEN_FILE, seen);
  } else {
    saveJSON(ALERTS_FILE, alerts);
  }

  return alerts;
}

app.post('/api/alerts/check', async (req, res) => {
  const alerts = await checkAlerts();
  res.json({ ok: true, alerts });
});

// Run alert check every 10 minutes
cron.schedule('*/10 * * * *', () => {
  console.log('[Cron] Checking alerts...');
  checkAlerts();
});

// ─── Stats ────────────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const history = loadJSON(HISTORY_FILE, {});
  const alerts = loadJSON(ALERTS_FILE, []);
  const totalTracked = Object.keys(history).length;
  const priceDrops = Object.values(history).filter(h => {
    if (h.prices.length < 2) return false;
    return h.prices.at(-1).price < h.prices[0].price;
  }).length;
  res.json({ ok: true, totalTracked, priceDrops, alertCount: alerts.length });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  Yad2 Tool running on port ${PORT}`);
  console.log(`   Env: ${process.env.RENDER ? 'Render' : 'local'} | Data: ${DATA_DIR}\n`);
});
