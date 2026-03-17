// ══════════════════════════════════════════════════════════
//  HarvestScope — MARS API Proxy Function
//  Vercel serverless function: /api/mars.js
//  Proxies USDA MyMarketNews MARS API so the key stays
//  server-side and never appears in the browser.
//
//  Usage from app:
//    /api/mars?commodity=asparagus
//
//  Returns JSON:
//  {
//    commodity: "ASPARAGUS",
//    entries: [
//      { origin: "MEXICO", low: 28.00, high: 34.00,
//        mostly_low: 30.00, mostly_high: 32.00,
//        package: "11 lb cartons bunched",
//        condition: "STEADY", supply: "NORMAL",
//        report_date: "2026-03-01" }
//    ],
//    supply_signal: "NORMAL",
//    report_date: "2026-03-01",
//    market: "San Francisco Terminal"
//  }
// ══════════════════════════════════════════════════════════

const MARS_BASE = 'https://marsapi.ams.usda.gov/services/v1.2/reports';

// Map app produce keys → MARS commodity search names + report slug IDs
// Reports: 2322=SF Fruit, 2323=SF Vegetables, 2324=SF Onions/Potatoes
const COMMODITY_MAP = {
  avocado:    { name: 'Avocados',     slugs: [2322] },
  strawberry: { name: 'Strawberries', slugs: [2322] },
  apple:      { name: 'Apples',       slugs: [2322] },
  blueberry:  { name: 'Blueberries',  slugs: [2322] },
  orange:     { name: 'Oranges',      slugs: [2322] },
  grape:      { name: 'Grapes',       slugs: [2322] },
  mango:      { name: 'Mangos',       slugs: [2322] },
  raspberry:  { name: 'Raspberries',  slugs: [2322] },
  cantaloupe: { name: 'Cantaloupes',  slugs: [2322] },
  watermelon: { name: 'Watermelons',  slugs: [2322] },
  tomato:     { name: 'Tomatoes',     slugs: [2323] },
  lettuce:    { name: 'Lettuce',      slugs: [2323] },
  broccolini: { name: 'Broccolini',   slugs: [2323] },
  asparagus:  { name: 'Asparagus',    slugs: [2323] },
  green_onion:{ name: 'Green Onions', slugs: [2323] },
  cauliflower:{ name: 'Cauliflower',  slugs: [2323] },
  mushroom:   { name: 'Mushrooms',    slugs: [2323] },
  carrot:     { name: 'Carrots',      slugs: [2323] },
  broccoli:   { name: 'Broccoli',     slugs: [2323] },
  potato:     { name: 'Potatoes',     slugs: [2324] },
  onion:      { name: 'Onions',       slugs: [2324] },
};

// Parse supply signal from MARS market_condition / environment text
function parseSupplySignal(condition = '', environment = '') {
  const text = (condition + ' ' + environment).toUpperCase();
  if (text.match(/VERY LIGHT|SCARCE|SHORT SUPPLY|VERY SHORT/)) return 'SHORT';
  if (text.match(/OFFERINGS LIGHT|SUPPLIES LIGHT|LIGHT OFFERINGS|TIGHT/)) return 'TIGHT';
  if (text.match(/HEAVY|SURPLUS|OVERSUPPLY|WELL SUPPLIED|GOOD SUPPLY|AMPLE/)) return 'AMPLE';
  if (text.match(/LOWER|DECLINING|WEAK/)) return 'DROPPING';
  if (text.match(/HIGHER|RISING|FIRM/)) return 'RISING';
  return 'NORMAL';
}

// Overall signal priority: SHORT > TIGHT > RISING > NORMAL > DROPPING > AMPLE
function overallSignal(signals) {
  if (signals.includes('SHORT'))    return 'SHORT';
  if (signals.includes('TIGHT'))    return 'TIGHT';
  if (signals.includes('RISING'))   return 'RISING';
  if (signals.includes('AMPLE'))    return 'AMPLE';
  if (signals.includes('DROPPING')) return 'DROPPING';
  return 'NORMAL';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const commodityKey = (req.query.commodity || '').toLowerCase();
  const mapping = COMMODITY_MAP[commodityKey];

  if (!mapping) {
    return res.status(400).json({ error: `Unknown commodity: ${commodityKey}` });
  }

  const apiKey = process.env.MARS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'MARS_API_KEY not configured' });
  }

  // Basic auth: key as username, no password
  const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');

  // Try each report slug until we get results
  for (const slug of mapping.slugs) {
    try {
      const url = `${MARS_BASE}/${slug}?q=commodity=${encodeURIComponent(mapping.name)}&lastReports=1`;
      const marsRes = await fetch(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });

      if (!marsRes.ok) continue;

      const json = await marsRes.json();

      // Log raw response on first call to verify field names against live data
      console.log(`MARS raw sample for ${mapping.name} (slug ${slug}):`,
        JSON.stringify((json.results || json.report || [])[0] || {})
      );

      const results = json.results || json.report || [];
      if (!results.length) continue;

      // Parse entries — each row is a package/origin combination
      const entries = [];
      for (const row of results) {
        const origin = (row.origin || row.district || '').trim();
        const low    = parseFloat(row.low_price  || row.price_low  || 0);
        const high   = parseFloat(row.high_price || row.price_high || 0);
        const mLow   = parseFloat(row.mostly_low  || row.price_mostly_low  || 0);
        const mHigh  = parseFloat(row.mostly_high || row.price_mostly_high || 0);
        const pkg    = (row.package || row.unit || '').trim();
        const cond   = (row.market_condition || row.conditions || '').trim();
        const env    = (row.environment || '').trim();
        const date   = row.report_date || row.published_date || '';

        if (!origin && !low) continue; // skip empty rows

        entries.push({
          origin,
          low,
          high,
          mostly_low:  mLow,
          mostly_high: mHigh,
          package: pkg,
          condition: cond,
          supply: parseSupplySignal(cond, env),
          report_date: date,
        });
      }

      if (!entries.length) continue;

      const signals    = entries.map(e => e.supply);
      const reportDate = entries[0].report_date;

      return res.status(200).json({
        commodity:     mapping.name,
        entries,
        supply_signal: overallSignal(signals),
        report_date:   reportDate,
        market:        'San Francisco Terminal',
        slug,
      });

    } catch (err) {
      console.error(`MARS fetch error for slug ${slug}:`, err.message);
      continue;
    }
  }

  // No data found in any report
  return res.status(200).json({
    commodity:     mapping.name,
    entries:       [],
    supply_signal: null,
    report_date:   null,
    market:        'San Francisco Terminal',
    note:          'No data available — commodity may not be in season or report not yet published today',
  });
}
