# API Data Refresh — Implementation Guide
**Pittsburgh Market Hub · Luminous Steel City Holdings**
*Researched May 2026 · Ready to implement when needed*

---

## Why This Exists

All market data in the playbooks is currently hardcoded by hand (Redfin, Zumper, Apartments.com, Census QuickFacts). This document describes how to replace that manual process with API-driven quarterly refreshes at zero cost.

---

## Known Bug to Fix First

**Crafton CLR is stale.** `locations/crafton_pa_playbook_v2.html` has `clr: 0.527` (2025 value). Every other playbook uses `clr: 0.5014` (2026 value). Crafton's tax estimates are being calculated on a different basis than the rest of the set. Fix before any automation is wired:

```js
// crafton_pa_playbook_v2.html — change this line:
clr: 0.527,
// to:
clr: 0.5014,
```

---

## API Sources

| Data Category | Source | Cost | Key Required |
|---|---|---|---|
| Rent avg / low / high / YoY by ZIP | [Rentcast](https://rentcast.io) | Free (50 calls/mo) | Yes — free signup |
| HCV / Section 8 payment standards | [HUD SAFMR API](https://www.huduser.gov/portal/dataset/fmr/oadatasets.html) | Free | No |
| Renter %, household income, renter income | [Census ACS API](https://api.census.gov) | Free | Yes — [free signup](https://api.census.gov/data/key_signup.html) |
| Median sale price + YoY | [Redfin Data Center bulk CSV](https://www.redfin.com/news/data-center/) | Free | No |
| Mill rates (change detection) | [Allegheny County Treasurer](https://alleghenycountytreasurer.us/real-estate-tax/local-and-school-district-tax-millage/) | Free (scrape) | No |
| CLR (Common Level Ratio) | [PA STEB PDF](https://www.revenue.pa.gov/TaxTypes/PropertyTaxes/Pages/CLR.aspx) | Free (PDF parse) | No |

**Not recommended:** ATTOM Data ($300–500+/mo), Estated (per-parcel only), Zillow API (deprecated 2019).

---

## Refresh Cadence

| Data | Frequency | Why |
|---|---|---|
| Rent avg / YoY, Median sale price | **Quarterly** | Moves enough to matter; Rentcast and Redfin update monthly |
| Mill rates | **Annually (January)** | Set by municipalities in fall budget cycle |
| CLR | **Annually (January)** | STEB publishes for the new calendar year |
| HCV payment standards | **Annually** | ACHA publishes updates periodically |
| Renter %, income data | **Annually** | ACS 5-year estimates release each December |

---

## Architecture Overview

**GitHub Actions + `shared/market-data.json`**

No server required. Site stays fully static on GitHub Pages. API keys never touch client-side code.

```
GitHub Actions (runs quarterly: Jan 1, Apr 1, Jul 1, Oct 1)
       │
       └── scripts/fetch_market_data.py
               ├── Rentcast API        → rent figures for all ZIPs
               ├── Redfin bulk CSV     → sale prices for all ZIPs
               ├── Census ACS API      → renter %, income data
               ├── HUD SAFMR API       → HCV payment standards
               └── Allegheny scrape    → flags mill rate changes (human confirms)
               │
               └── writes → shared/market-data.json
                           → git commit + push → GitHub Pages rebuilds
```

**`playbook.js` reads the JSON at page load** and patches `window.PLAYBOOK_CONFIG` before the calculator runs. The hardcoded values in each HTML file remain as offline fallback.

---

## market-data.json Structure

```json
{
  "generated": "2026-09-01T06:00:00Z",
  "clr_allegheny": 0.5014,
  "locations": {
    "brentwood": {
      "zip": "15227",
      "mills": 56.6277,
      "mills_components": { "borough": 11.00, "school": 39.1977, "county": 6.43 },
      "rent_2br_avg": 1150,
      "rent_2br_low": 900,
      "rent_2br_high": 1350,
      "rent_2br_yoy_pct": 11.0,
      "median_sale_price": 168000,
      "median_sale_yoy_pct": 8.4,
      "renter_pct": 42,
      "median_hh_income": 75448,
      "renter_median_income": 27292,
      "hcv_2br_low": 1050,
      "hcv_2br_high": 1250,
      "last_updated": "2026-09-01"
    }
  }
}
```

Location keys used across all playbooks:
`bethel_park` · `carnegie` · `mckeesport` · `bellevue` · `crafton` · `highland_park` · `brighton_heights` · `beechview` · `dormont` · `brookline` · `brentwood`

---

## Files to Create / Modify

### New files
| File | Purpose |
|---|---|
| `scripts/fetch_market_data.py` | Python script — fetches all APIs, writes JSON |
| `shared/market-data.json` | Output data file read by playbook.js at runtime |
| `.github/workflows/refresh-market-data.yml` | Quarterly GitHub Actions cron job |

### Modified files
| File | Change |
|---|---|
| `shared/playbook.js` | Add async fetch of `market-data.json` at top; patch `window.PLAYBOOK_CONFIG` before `calc()` |
| Each `locations/*.html` | Add `locationKey: 'brentwood'` field to `window.PLAYBOOK_CONFIG` block (one-time, 11 files) |
| `index.html` | Card stat values driven from `market-data.json` via a small inline script |

---

## GitHub Actions Workflow

```yaml
# .github/workflows/refresh-market-data.yml
name: Quarterly Market Data Refresh
on:
  schedule:
    - cron: '0 6 1 1,4,7,10 *'  # 6am UTC on Jan 1, Apr 1, Jul 1, Oct 1
  workflow_dispatch:              # manual trigger for ad-hoc runs
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install requests beautifulsoup4 pandas pdfplumber
      - run: python scripts/fetch_market_data.py
        env:
          RENTCAST_API_KEY: ${{ secrets.RENTCAST_API_KEY }}
          CENSUS_API_KEY: ${{ secrets.CENSUS_API_KEY }}
      - name: Commit updated data
        run: |
          git config user.name "market-data-bot"
          git config user.email "bot@luminoussteelcity.com"
          git add shared/market-data.json
          git diff --staged --quiet || git commit -m "chore: quarterly market data refresh $(date +%Y-%m-%d)"
          git push
```

---

## playbook.js Patch (what gets added)

```javascript
// Add at the top of shared/playbook.js before any other logic:
(async function () {
  try {
    const resp = await fetch('../shared/market-data.json');
    const data = await resp.json();
    const key = window.PLAYBOOK_CONFIG.locationKey;
    const loc = key && data.locations[key];
    if (loc) {
      window.PLAYBOOK_CONFIG.clr   = data.clr_allegheny;
      window.PLAYBOOK_CONFIG.mills = loc.mills;
      window.PLAYBOOK_CONFIG.rentDefaults = {
        duplex:  Math.round(loc.rent_2br_avg * 2 / 50) * 50,
        triplex: Math.round(loc.rent_2br_avg * 2.75 / 50) * 50,
        quad:    Math.round(loc.rent_2br_avg * 4 / 50) * 50
      };
    }
  } catch (e) {
    // fall through — hardcoded HTML values remain in effect
  }
  calc();
})();
```

---

## Census API Variable Reference

Endpoint: `https://api.census.gov/data/2023/acs/acs5`

| Variable | Meaning |
|---|---|
| `B25003_001E` | Total occupied housing units |
| `B25003_003E` | Renter-occupied units → divide by 001 for renter % |
| `B19013_001E` | Median household income (all households) |
| `B25119_002E` | Median household income — renter-occupied units |

Example call:
```
GET https://api.census.gov/data/2023/acs/acs5
  ?get=B25003_001E,B25003_003E,B19013_001E,B25119_002E
  &for=zip%20code%20tabulation%20area:15227
  &key=YOUR_KEY
```

---

## HUD SAFMR Endpoint

```
GET https://www.huduser.gov/hudapi/public/fmr/data/{zip}
```

Returns FY payment standards for 0BR–4BR at ZIP level. No key required.

---

## Cost Estimate

| Source | Calls/quarter | Calls/year | Cost |
|---|---|---|---|
| Rentcast | 11 | 44 | $0 (free tier = 50/mo) |
| HUD SAFMR | 11 | 44 | $0 |
| Census ACS | 11 | 44 | $0 |
| Redfin CSV | 1 download | 4 | $0 |
| Treasurer scrape | 1 page | 4 | $0 |
| **Total** | | | **$0/year** |

If Rentcast's free tier ever changes, their Starter plan is $29/month.

---

*When ready to build: share this file with Claude and say "implement the API data refresh using docs/api-data-refresh.md" — everything needed is here.*
