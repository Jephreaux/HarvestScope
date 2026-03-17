# Design Handoff — HarvestScope

## Status: Complete
Design pass applied to `index.html`. No structural changes — CSS and two JS color blocks only.

---

## Design Direction

**Warm Earth Dark** — away from the original "broadcast ops" neon-on-cold-navy aesthetic toward something that reads as a Pacific Northwest produce intelligence tool. Deep forest floor dark, muted harvest green, amber as the live/warmth accent.

The governing logic: satellite imagery works best on dark backgrounds, but the UI chrome should feel warm, not clinical. The one serif moment (Playfair Display italic on the commodity name) is intentional — it pulls the panel from "data dashboard" toward "food magazine meets supply tool."

---

## Fonts

| Role | Font | Weight/Style |
|---|---|---|
| Commodity name (`#d-name`) | Playfair Display | 600, italic |
| All data labels, stats, badges | Barlow Condensed | 700–900 |
| Body, notes | Barlow | 400–600 |

Google Fonts import now includes `Playfair+Display:ital,wght@0,600;1,600`.

---

## Color Palette

| Token | Value | Usage |
|---|---|---|
| `--green` | `#7eb33a` | Active pill selection, season chart, USDA links, NORMAL supply |
| `--amber` | `#c8913a` | LIVE badge, category tab active, logo subtitle, forecast bars |
| `--yellow` | `#d4973a` | TIGHT supply signal |
| `--orange` | `#d4613a` | RISING supply signal |
| `--red` | `#c43a3a` | SHORT supply signal |
| `--panel-bg` | `rgba(6,11,4,0.96)` | Panel/drawer background |
| `--border` | `rgba(255,255,255,0.08)` | Internal dividers |
| Body bg | `#060a04` | Page background (deep forest) |
| Warm text | `#f0f4e8` | Primary text in panel (warm white, not pure) |
| Muted text | `rgba(200,210,180,.28–.45)` | Labels, subtitles, secondary data |

**Reasoning for amber vs. green split:**
- Green = produce, selection, data (what you've picked, what's growing)
- Amber = live activity, navigation categories, temporal signals (what's happening now)

---

## Supply Signal Colors (SUPPLY_STYLES in JS)

| Signal | Color | Background |
|---|---|---|
| SHORT | `#d44040` | `rgba(212,64,64,0.15)` |
| TIGHT | `#d4973a` | `rgba(212,151,58,0.15)` |
| RISING | `#d4703a` | `rgba(212,112,58,0.15)` |
| NORMAL | `#7eb33a` | `rgba(126,179,58,0.14)` |
| DROPPING | `#c8913a` | `rgba(200,145,58,0.15)` |
| AMPLE | `#5a9fbe` | `rgba(90,159,190,0.14)` |

Note: Weather condition tag colors (in `wxGlowStyle()` / `wxCondition()`) are semantic and unchanged — rain=blue, heat=orange, freeze=cyan. Correct.

---

## Key Design Decisions

**`#d-name` → Playfair Display italic**
The single most impactful change. When the panel opens with "Avocado" or "Strawberry" rendered in Playfair italic at 20px, it creates an anchor moment that reads differently from every other element. One serif in a sea of condensed grotesque.

**Amber for LIVE badge and category tabs**
The green accent was doing too much work — selection, live state, supply signal, season highlight all in the same neon. Splitting to amber for "active/live" states and green for "selected/growth" data creates visual grammar.

**Forecast bar fill → `var(--amber)`**
Was an arbitrary disconnected `#6899e8` with no design intent. Now harmonizes with the amber accent system.

**Panel border → green-tinted**
`rgba(126,179,58,0.14)` instead of pure white opacity. Subtle, but it ties the panel chrome to the harvest green palette without being obvious.

**Map tile brightness → 0.60 (was 0.55)**
Slightly more terrain visible. Combined with warm panel backgrounds, the overall composition is less "command bunker."

---

## What QA Should Pay Attention To

- **Playfair Display loading** — if Google Fonts fails to load, `#d-name` falls back to serif (Times/Georgia). Acceptable fallback but test that the font import is loading correctly.
- **Pill active state** — `color:#e8f0d8` (warm off-white) not pure white. Verify it's readable against the green-glow background on all commodities.
- **LIVE badge** — now amber, was green. Confirm the blinking amber dot renders against both the logo and the gradient at various viewport widths.
- **Season chart bars** — JS-driven colors now use `rgba(126,179,58,...)`. Confirm bars are visible on the dark panel background especially for low-season months (low opacity).
- **Panel border-radius** — bumped from 13px to 14px. On mobile drawer, still `18px 18px 0 0`. No conflict.
- **Supply signals** — DROPPING changed from blue to amber. AMPLE changed from the same blue to a distinct slate blue `#5a9fbe`. Verify these are visually distinct from each other and from TIGHT/RISING.
