# Backend Handoff — HarvestScope

## Status: Complete
Backend is live. All API calls working against real USDA data.

---

## Deployment
- **Production URL:** https://harvestscope.smitmo.com
- **Vercel URL:** https://harvest-scope.vercel.app
- **GitHub:** https://github.com/Jephreaux/HarvestScope
- **Platform:** Vercel (migrated from Netlify)
- **DNS:** Cloudflare CNAME → Vercel (DNS only, gray cloud)

---

## API Endpoint
`GET /api/mars?commodity={key}`

### Commodity keys
Fruits (slug 2306): `avocado`, `strawberry`, `apple`, `blueberry`, `orange`, `grape`, `mango`, `raspberry`, `cantaloupe`, `watermelon`

Vegetables (slug 2307): `tomato`, `lettuce`, `broccolini`, `asparagus`, `green_onion`, `cauliflower`, `mushroom`, `carrot`, `broccoli`

Onions/Potatoes (slug 2308): `potato`, `onion`

### Response shape
```json
{
  "commodity": "Avocados",
  "market": "Los Angeles Terminal",
  "report_date": "03/16/2026",
  "supply_signal": "NORMAL",
  "entries": [
    {
      "origin": "Mexico",
      "variety": "HASS",
      "package": "cartons 2 layer",
      "low": 34,
      "high": 36,
      "mostly_low": 32,
      "mostly_high": 34,
      "condition": "MARKET STEADY",
      "supply": "NORMAL",
      "report_date": "03/16/2026"
    }
  ]
}
```

### Supply signal values
`SHORT` | `TIGHT` | `RISING` | `NORMAL` | `DROPPING` | `AMPLE`

Priority order for `supply_signal` (worst to best): SHORT > TIGHT > RISING > NORMAL > DROPPING > AMPLE

---

## Data Source
USDA MARS API — Los Angeles Terminal Market daily wholesale prices.
Reports publish weekdays ~1pm Pacific. No data on weekends/holidays.

The `entries` array has multiple rows per commodity — one per variety/size/package combination. For example, avocados return 8 rows (different sizes: 48s, 60s, 70s, etc.).

**Frontend should aggregate entries** into a single display per commodity:
- Show price range as `min(low)` – `max(high)` across all entries
- Show `mostly_low` / `mostly_high` from the entry with the highest volume (or average them)
- Use `supply_signal` (top-level) for the badge color — already rolled up

---

## Known edge cases
- `high: 0` means a single-price quote — display as just the low price
- `mostly_low: 0` / `mostly_high: 0` means no "mostly" range — omit that display
- No data on weekends: API returns `{ entries: [], supply_signal: null, note: "No data available" }`
- The frontend currently calls `/api/mars` — correct, no changes needed there

---

## Frontend call site
`index.html` → `fetchMars()` function calls `/api/mars?commodity={key}`

The frontend was updated to use the Vercel path (`/api/mars`) from the old Netlify path (`/.netlify/functions/mars`).

---

## Logo replacement
The current logo is text-based (`index.html:309`):
```html
<div id="logo-name">🌿 HarvestScope</div>
<div id="logo-sub">Jeffco Produce Origins &amp; Live Weather</div>
```
The user has an actual logo image file to use instead. Ask them to drop the file into the repo, then replace the text divs with an `<img>` tag. Keep `#logo-sub` or integrate the tagline however fits the design. Size the logo to match the current header height.
