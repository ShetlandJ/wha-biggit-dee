# Wha Biggit Dee

Ancestor journey map visualization. Takes genealogy data from TNG (The Next Generation of Genealogy Sitebuilding) sites and plots ancestor migration patterns on an interactive map.

## Data source

- **Site**: https://www.bayanne.info/Shetland/ (North Isles Family History, TNG v14)
- **Text pedigree** is the best view to scrape: `pedigreetext.php?personID={ID}&tree=ID1&parentset=0&generations=8`
- Fan chart view also works but text is cleaner and has more specific place names
- TNG place format: `specific_place, parish, county_code, country_code` (e.g. `Hamnavoe, Burra, SHI, SCT`)
- Codes: `SHI` = Shetland Islands, `SCT` = Scotland

## Current root person

- **Marilyn Susan HALCROW** — personID: `I210520`, born 1962, Lerwick
- 138 ancestors across 8 generations (~1690s–1962)

## To replicate with a different person

1. Navigate to `https://www.bayanne.info/Shetland/pedigreetext.php?personID={NEW_ID}&tree=ID1&parentset=0&generations=8`
2. Parse the text pedigree — entries follow ahnentafel numbering:
   - Format: `N. Firstname LASTNAME` followed by `B: date`, `P: place`, `M: date`, `P: place`, `D: date`, `P: place`
   - Person N has father 2N, mother 2N+1
3. Save parsed data to `data/ancestors.json` (same schema as current file)
4. Run the place resolver against `data/places.json` — check for unresolved places and add coordinates
5. The app reads `data/ancestors.json` and `data/places.json` at runtime, everything else is generic

## Place resolver

- `src/places.js` — strips TNG codes (SHI, SCT etc), walks the place string right-to-left trying progressively broader matches
- `data/places.json` — manual coordinate lookup, keyed by place name fragments
- `findUnresolved()` helper reports places that can't be resolved — use this when adding new people
- Coordinates are approximate settlement/parish centroids — verify against the map

## Stack

- Vanilla JS, no build step
- Leaflet + CARTO dark tiles
- Served as static files (GitHub Pages at https://shetlandj.github.io/wha-biggit-dee/)
- Future: Cloudflare Worker proxy to fetch TNG data live by person ID

## File structure

```
data/ancestors.json   — parsed ancestor data (ahnentafel numbered)
data/places.json      — place name → lat/lng lookup with TNG code mappings
src/app.js            — main app: map, sidebar, filtering, info panels
src/places.js         — place resolver (resolvePlace, findUnresolved)
index.html
style.css
```
