// ══════════════════════════════════════════════════════════
//  HarvestScope — MARS API Proxy Function
//  Vercel serverless function: /api/mars.js
//  Proxies USDA MyMarketNews MARS API so the key stays
//  server-side and never appears in the browser.
//
//  Usage from app:
//    /api/mars?commodity=asparagus
// ══════════════════════════════════════════════════════════

const MARS_BASE = 'https://marsapi.ams.usda.gov/services/v1.2/reports';

// Map app produce keys → MARS commodity search names + report slug IDs
// SF Terminal reports: 2322=Fruit, 2323=Vegetables, 2324=Onions/Potatoes
// TODO: swap to LA Terminal slugs once confirmed (search MARS for "Los Angeles")
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

  if (req.method === 'OPTIONS') return res.status(200).end();

  const commodityKey = (req.query.commodity || '').toLowerCase();
  const mapping = COMMODITY_MAP[commodityKey];

  if (!mapping) {
    return res.status(400).json({ error: `Unknown commodity: ${commodityKey}` });
  }

  const apiKey = process.env.MARS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'MARS_API_KEY not configured' });
  }

  const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
  const _debug = [];

  for (const slug of mapping.slugs) {
    try {
      // Fetch full report — MARS doesn't support q= filtering on report endpoints
      const url = `${MARS_BASE}/${slug}?lastReports=1`;
      const marsRes = await fetch(url, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });

      if (!marsRes.ok) {
        const errText = await marsRes.text();
        _debug.push({ slug, status: marsRes.status, error: errText.slice(0, 300) });
        continue;
      }

      const rawText = await marsRes.text();
      let json;
      try { json = JSON.parse(rawText); } catch (e) {
        _debug.push({ slug, parseError: e.message, rawSnippet: rawText.slice(0, 300) });
        continue;
      }

      const allRows = json.results || json.report || (Array.isArray(json) ? json : []);

      // Log first row so we can verify field names against live data
      _debug.push({ slug, status: marsRes.status, totalRows: allRows.length, firstRow: allRows[0] || null });

      if (!allRows.length) continue;

      // Filter rows to this commodity (case-insensitive, partial match handles plurals)
      const searchName = mapping.name.toLowerCase();
      const matched = allRows.filter(row => {
        const rowCommodity = (
          row.commodity_name || row.commodity || row.Commodity ||
          row['Commodity Name'] || row.item || ''
        ).toLowerCase();
        return rowCommodity.includes(searchName) || searchName.includes(rowCommodity);
      });

      _debug.push({ slug, matchedRows: matched.length });
      if (!matched.length) continue;

      // Parse entries — each row is a package/origin combination
      const entries = [];
      for (const row of matched) {
        const origin = (row.origin || row.Origin || row.district || row.District || '').trim();
        const low    = parseFloat(row.low_price  || row.low  || row.Low  || 0);
        const high   = parseFloat(row.high_price || row.high || row.High || 0);
        const mLow   = parseFloat(row.mostly_low  || row.Mostly_Low  || 0);
        const mHigh  = parseFloat(row.mostly_high || row.Mostly_High || 0);
        const pkg    = (row.package || row.Package || row.unit || row.Unit || '').trim();
        const cond   = (row.market_condition || row.Market_Condition || row.conditions || '').trim();
        const env    = (row.environment || row.Environment || '').trim();
        const date   = row.report_date || row.Report_Date || row.published_date || '';

        if (!origin && !low) continue;

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
        _debug,
      });

    } catch (err) {
      _debug.push({ slug, exception: err.message });
      continue;
    }
  }

  return res.status(200).json({
    commodity:     mapping.name,
    entries:       [],
    supply_signal: null,
    report_date:   null,
    market:        'San Francisco Terminal',
    note:          'No data available',
    _debug,
  });
}
