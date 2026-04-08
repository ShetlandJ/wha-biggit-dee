# Wha Biggit Dee

Ancestor journey map visualization. Takes genealogy data from TNG (The Next Generation of Genealogy Sitebuilding) sites and plots ancestor migration patterns on an interactive map.

## Data source

- **Site**: https://www.bayanne.info/Shetland/ (North Isles Family History, TNG v14)
- **Text pedigree** is the best view to scrape: `pedigreetext.php?personID={ID}&tree=ID1&parentset=0&generations=8`
- Fan chart view also works but text is cleaner and has more specific place names
- TNG place format: `specific_place, parish, county_code, country_code` (e.g. `Hamnavoe, Burra, SHI, SCT`)
- Codes: `SHI` = Shetland Islands, `SCT` = Scotland

## People

App supports multiple people via `?id=` query param. Default is I210520.

| Person | ID | URL | Ancestors | Geography |
|---|---|---|---|---|
| Marilyn Susan HALCROW | `I210520` | `?id=I210520` | 138, 8 gens | Burra, Northmavine, Tingwall |
| Living (Burgess tree) | `I227628` | `?id=I227628` | 248, 8 gens | Dunrossness, Yell, Whalsay, Fetlar |

## To add a new person

1. Fetch: `curl -s 'https://www.bayanne.info/Shetland/pedigreetext.php?personID={ID}&tree=ID1&parentset=0&generations=8' > /tmp/pedigree_{ID}.html`
2. Parse the HTML — person IDs are in `<a href="getperson.php?personID=XXX">` links. Events (B:/M:/D:/P:) are in table cells inside `<span class="normal">` tags, NOT plain text.
3. Save to `data/ancestors_{ID}.json` (same schema: ahnentafel, name, pID, events[], generation)
4. Run place resolver — `findUnresolved()` — and geocode new places via Nominatim: `curl 'https://nominatim.openstreetmap.org/search?q={place}+Shetland&format=json&limit=1'`
5. App automatically loads the right file based on `?id=` param

### Known TNG place codes

`SHI` = Shetland, `SCT` = Scotland, `ORK` = Orkney, `ABD` = Aberdeen, `NBL` = Northumberland, `ENG` = England

### Parsing gotcha

The text pedigree HTML uses table cells for events, not plain text lines. The `B:`, `P:` etc are inside `<span>` tags in `<td>` elements. A regex approach works — see the scraping script pattern:
```
&nbsp;(B|M|D|P):(?:&nbsp;)?</span></td>\s*<td[^>]*><span[^>]*>(.*?)(?:&nbsp;)*</span>
```

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
data/ancestors.json         — Marilyn Halcrow (I210520) ancestor data
data/ancestors_I227628.json — Burgess tree (I227628) ancestor data
data/places.json            — shared place name → lat/lng lookup
src/app.js                  — main app: map, sidebar, filtering, info panels
src/places.js               — place resolver (resolvePlace, findUnresolved)
index.html
style.css
```
