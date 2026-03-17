// Temporary discovery endpoint — find LA Terminal report slug IDs
// Usage: /api/discover?q=los+angeles
// DELETE this file once LA slug IDs are confirmed

export default async function handler(req, res) {
  const apiKey = process.env.MARS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'MARS_API_KEY not configured' });

  const q = req.query.q || 'los angeles';
  const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');

  const url = `https://marsapi.ams.usda.gov/services/v1.2/reports?q=report_title=${encodeURIComponent(q)}`;
  const marsRes = await fetch(url, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });

  const text = await marsRes.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { return res.status(200).send(text); }

  // Return just slug_id, slug_name, report_title for easy reading
  const reports = (json.results || json.report || (Array.isArray(json) ? json : []));
  const trimmed = reports.map(r => ({
    slug_id:      r.slug_id || r.id,
    slug_name:    r.slug_name,
    report_title: r.report_title,
    state:        r.state,
    city:         r.city,
    market_type:  r.market_type,
  }));

  return res.status(200).json({ status: marsRes.status, count: trimmed.length, reports: trimmed, raw_first: reports[0] });
}
