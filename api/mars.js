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
// LA Terminal reports: 2306=Fruit (HC_FV010), 2307=Vegetables (HC_FV020), 2308=Onions/Potatoes (HC_FV030)
const COMMODITY_MAP = {
  avocado:    { name: 'Avocados',     slugs: [2306] },
  strawberry: { name: 'Strawberries', slugs: [2306] },
  apple:      { name: 'Apples',       slugs: [2306] },
  blueberry:  { name: 'Blueberries',  slugs: [2306] },
  orange:     { name: 'Oranges',      slugs: [2306] },
  grape:      { name: 'Grapes',       slugs: [2306] },
  mango:      { name: 'Mangos',       slugs: [2306] },
  raspberry:  { name: 'Raspberries',  slugs: [2306] },
  cantaloupe: { name: 'Cantaloupes',  slugs: [2306] },
  watermelon: { name: 'Watermelons',  slugs: [2306] },
  tomato:     { name: 'Tomatoes',     slugs: [2307] },
  lettuce:    { name: 'Lettuce',      slugs: [2307] },
  broccolini: { name: 'Broccolini',   slugs: [2307] },
  asparagus:  { name: 'Asparagus',    slugs: [2307] },
  green_onion:{ name: 'Green Onions', slugs: [2307] },
  cauliflower:{ name: 'Cauliflower',  slugs: [2307] },
  mushroom:   { name: 'Mushrooms',    slugs: [2307] },
  carrot:     { name: 'Carrots',      slugs: [2307] },
  broccoli:   { name: 'Broccoli',     slugs: [2307] },
  potato:     { name: 'Potatoes',     slugs: [2308] },
  onion:      { name: 'Onions',       slugs: [2308] },
};

// Parse supply signal from MARS market_condition / environment text
function parseSupplySignal(condition = '') {
  const text = condition.toUpperCase();
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

  for (const slug of mapping.slugs) {
    try {
      // Fetch price line items from the "report details" sub-resource
      const dataRes = await fetch(`${MARS_BASE}/${slug}/report%20details?lastReports=1`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!dataRes.ok) continue;

      let json;
      try { json = JSON.parse(await dataRes.text()); } catch (e) { continue; }

      const allRows = json.results || json.report || (Array.isArray(json) ? json : []);
      if (!allRows.length) continue;

      // Filter rows to this commodity (case-insensitive, partial match handles plurals)
      const searchName = mapping.name.toLowerCase();
      const matched = allRows.filter(row =>
        (row.commodity || '').toLowerCase().includes(searchName) ||
        searchName.includes((row.commodity || '').toLowerCase())
      );
      if (!matched.length) continue;

      // Parse entries — each row is a variety/package/origin combination
      const entries = [];
      for (const row of matched) {
        const low  = parseFloat(row.low_price  || 0);
        const high = parseFloat(row.high_price || 0);
        if (!row.origin && !low) continue;

        entries.push({
          origin:      (row.origin   || '').trim(),
          variety:     (row.variety  || '').trim(),
          package:     (row.package  || '').trim(),
          low,
          high,
          mostly_low:  parseFloat(row.mostly_low_price  || 0),
          mostly_high: parseFloat(row.mostly_high_price || 0),
          condition:   (row.market_tone_comments || '').trim(),
          supply:      parseSupplySignal(row.market_tone_comments || ''),
          report_date: row.report_date || '',
        });
      }

      if (!entries.length) continue;

      const signals    = entries.map(e => e.supply);

      return res.status(200).json({
        commodity:     mapping.name,
        entries,
        supply_signal: overallSignal(signals),
        report_date:   entries[0].report_date,
        market:        'Los Angeles Terminal',
      });

    } catch (err) {
      continue;
    }
  }

  return res.status(200).json({
    commodity:     mapping.name,
    entries:       [],
    supply_signal: null,
    report_date:   null,
    market:        'Los Angeles Terminal',
    note:          'No data available',
  });
}
