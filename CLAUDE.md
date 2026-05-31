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
| Mackie John BURGESS | `I227628` | `?id=I227628` | 255, 8 gens | Dunrossness, Yell, Whalsay, Fetlar |
| Michael STEWART | `I228247` | `?id=I228247` | 202, 8 gens | Whalsay |
| Colleen Lois HUGHSON | `I224035` | `?id=I224035` | 199, 8 gens | Lerwick, Skerries, Whalsay, Sandsting, Walls, Sandwick |
| Matthew Graeme HENDERSON | `I194187` | `?id=I194187` | 166, 8 gens | Unst, Yell, Delting, Edinburgh |
| Shirley Wilda WILLIAMSON | `I161735` | `?id=I161735` | 153, 8 gens | Walls, Quarff, Foula, Lerwick |
| Neil Alexander Muir MANSON | `I70522` | `?id=I70522` | 121, 8 gens | Quarff, Bressay, Lerwick |
| Andrew Peter SANDISON | `I225912` | `?id=I225912` | 74, 8 gens | Lerwick, Nesting, Yell, Colinton |
| Vincent WALTERSON | `I207222` | `?id=I207222` | 55, 8 gens | Liverpool, Sandness, Walls, Aithsting, Sandsting |
| Ian William WALTERSON | `I366084` | `?id=I366084` | 55, 8 gens | Liverpool, Sandness, Walls, Aithsting, Sandsting (Vincent's brother) |
| Louise MALCOLMSON | `I195938` | `?id=I195938` | 171, 8 gens | Lerwick, Sound, Unst, Mid Yell, Tingwall, Toft (Delting), Browney Colliery (Durham) |
| Hannah Mary GOODLAD | `I317065` | `?id=I317065` | 121, 8 gens | Burra, Whalsay, Weisdale, Whiteness, Sandsting, Lunnasting, Dunrossness; maternal line Fraserburgh (Aberdeenshire), no Shetland ancestry |

## To add a new person

1. Fetch: `curl -s 'https://www.bayanne.info/Shetland/pedigreetext.php?personID={ID}&tree=ID1&parentset=0&generations=8' > /tmp/pedigree_{ID}.html`
2. Parse the HTML — person IDs are in `<a href="getperson.php?personID=XXX">` links. Events (B:/M:/D:/P:) are in table cells inside `<span class="normal">` tags, NOT plain text.
3. Save to `data/ancestors_{ID}.json` (same schema: ahnentafel, name, pID, events[], generation)
4. Run place resolver — `findUnresolved()` — and geocode new places via Nominatim: `curl 'https://nominatim.openstreetmap.org/search?q={place}+Shetland&format=json&limit=1'`
5. App automatically loads the right file based on `?id=` param

### Known TNG place codes

`SHI` = Shetland, `SCT` = Scotland, `ORK` = Orkney, `ABD` = Aberdeen, `NBL` = Northumberland, `ENG` = England, `MLN` = Midlothian, `WLN` = West Lothian, `FIF` = Fife, `KCD` = Kincardineshire, `LKS` = Lanarkshire, `DEV` = Devon, `COR` = Cornwall, `MDX` = Middlesex, `BEW` = Berwickshire, `BER` = Berwick, `DUR` = Durham, `LAN` = Lancashire

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
data/ancestors_I227628.json — Mackie Burgess (I227628) ancestor data
data/ancestors_I228247.json — Michael Stewart (I228247) ancestor data
data/ancestors_I224035.json — Colleen Hughson (I224035) ancestor data
data/ancestors_I194187.json — Matthew Henderson (I194187) ancestor data
data/ancestors_I161735.json — Shirley Williamson (I161735) ancestor data
data/ancestors_I70522.json  — Neil Manson (I70522) ancestor data
data/ancestors_I225912.json — Andrew Sandison (I225912) ancestor data
data/ancestors_I207222.json — Vincent Walterson (I207222) ancestor data
data/ancestors_I366084.json — Ian Walterson (I366084) ancestor data — Vincent's brother
data/ancestors_I195938.json — Louise Malcolmson (I195938) ancestor data
data/ancestors_I317065.json — Hannah Mary Goodlad (I317065) ancestor data — paternal GOODLAD line, maternal side non-Shetland
data/places.json            — shared place name → lat/lng lookup (~170 places)
src/app.js                  — main app: map, sidebar, filtering, info panels
src/places.js               — place resolver (resolvePlace, findUnresolved)
index.html
style.css
```

## Notes

- "Living" people on Bayanne require authentication to see full data. Scrape from a logged-in browser session, not curl.
- Ancestor collapse (same person on both tree sides) is handled — place info panel deduplicates by pID.
- Sea deaths (At Haaf, At sea, Hoga Baa Ship etc) all map to a single point west of Shetland (60.3, -2.5).
- Place coordinates verified against Nominatim/OSM. Always verify visually — Nominatim returns wrong results for some Shetland places (e.g. multiple "Linga" islands, "Sandwick" in wrong parish).
- GitHub Pages CDN caches for 10 mins (max-age=600). Hard refresh to bust.
