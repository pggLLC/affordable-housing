# Minimal Cleanup + Styling Normalization (No Redesign)

This package keeps your existing working content and scripts, while:
- removing obvious junk/duplicates (macOS __MACOSX + leading-hyphen duplicates)
- removing unused map assets (maps/ and us-states.geojson were not referenced by any HTML)
- normalizing styling so all pages share the same header/nav look:
  - removes alternative theme CSS files (modernist-theme, mid-century-dark)
  - ensures unified-theme.css is present and loaded LAST on every page
  - removes duplicate <link> and <script src> tags on pages that had duplicates

Adds:
- census-dashboard.html + js/census-multifamily.js
  - ACS DP04 multifamily shares (5–9, 10–19, 20+ units) with a geography switch:
    National (US), State, County, Place (City)

Keeps:
- all existing FRED charts and files (no removal of your existing FRED scripts/pages)
- existing dashboards / regional pages and their scripts

## Deploy (wipe and upload) – safest method

### Option A: local git (recommended)
1. Clone:
   git clone https://github.com/pggllc/lihtc-analytics-hub.git
   cd lihtc-analytics-hub

2. Wipe tracked files:
   git rm -r .

3. Copy the contents of this zip into the repo root.

4. Commit + push:
   git add .
   git commit -m "Minimal cleanup + consistent styling + add Census dashboard"
   git push

5. GitHub → Settings → Pages
   Ensure it deploys from your branch and root folder:
   - Branch: main (or your default)
   - Folder: /(root)

### Option B: GitHub web UI (works, slower)
- Delete files/folders in the repo (commit deletions)
- Upload the contents of this zip (commit)

## Verify pages
- index.html
- dashboard.html
- regional.html
- economic-dashboard.html (FRED charts)
- census-dashboard.html (ACS geography switch)
