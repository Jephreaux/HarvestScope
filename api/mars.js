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
  const debugMode = req.query.debug === '1';

  for (const slug of mapping.slugs) {
    try {
      // Step 1: get the most recent report date
      const metaRes = await fetch(`${MARS_BASE}/${slug}?lastReports=1`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!metaRes.ok) continue;

      let metaJson;
      try { metaJson = JSON.parse(await metaRes.text()); } catch (e) { continue; }

      const metaRows = metaJson.results || metaJson.report || (Array.isArray(metaJson) ? metaJson : []);
      if (!metaRows.length) continue;
      const reportDate = metaRows[0].report_date || metaRows[0].Report_Date;
      if (!reportDate) continue;

      // Step 2: fetch actual price line items — date in path as YYYY-MM-DD
      const [mm, dd, yyyy] = reportDate.split('/');
      const datePath = `${yyyy}-${mm}-${dd}`;
      const dataRes = await fetch(`${MARS_BASE}/${slug}/${datePath}`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });

      if (debugMode) {
        const rawDbg = await dataRes.text();
        let jsonDbg;
        try { jsonDbg = JSON.parse(rawDbg); } catch(e) { return res.status(200).json({ slug, reportDate, datePath, status: dataRes.status, raw: rawDbg.slice(0, 500) }); }
        const rows = jsonDbg.results || jsonDbg.report || (Array.isArray(jsonDbg) ? jsonDbg : []);
        return res.status(200).json({ slug, reportDate, datePath, status: dataRes.status, totalRows: rows.length, samples: rows.slice(0,3).map(r => ({ keys: Object.keys(r), row: r })) });
      }

      if (!dataRes.ok) continue;

      const rawText = await dataRes.text();
      let json;
      try { json = JSON.parse(rawText); } catch (e) { continue; }

      const allRows = json.results || json.report || (Array.isArray(json) ? json : []);
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
