# Wha Biggit Dee

Ancestor journey map visualization. Takes genealogy data from TNG (The Next Generation of Genealogy Sitebuilding) sites and plots ancestor migration patterns on an interactive map.

**This repo is the local scraping/data workspace.** The live site is the Laravel app in `~/projects/wha-biggit-dee-app` (Laravel Cloud, public at https://jastewart.co.uk/whars-du-fae). Front-end changes go in the app's `public/src/`; this repo's `src/`, `index.html` and `style.css` are the original static version, kept for local place testing. Trees reach the site via `php artisan tree:push` from the app dir.

## Data source

- **Site**: https://www.bayanne.info/Shetland/ (North Isles Family History, TNG v14)
- **Text pedigree** is the best view to scrape: `pedigreetext.php?personID={ID}&tree=ID1&parentset=0&generations=8`
- Person page: `getperson.php?personID={ID}&tree=ID1`
- TNG place format: `specific_place, parish, county_code, country_code` (e.g. `Hamnavoe, Burra, SHI, SCT`)
- County codes are listed in `KNOWN_CODES` in `src/places.js` (TNG uses both `ORK` and `OKI` for Orkney). A new code goes into KNOWN_CODES in **both** `src/places.js` and the app's `public/src/places.js`, plus a county entry keyed by the code in `data/places.json`.

## Adding trees

Most trees now come from landing-page requests. The `/whars-requests` skill runs the whole flow: list requests, scrape, place, push, email. For a one-off tree, do the same steps by hand:

1. **Fetch** in Chrome with James logged in to Bayanne. Plain curl hits the bot check. Open `searchform.php`, then same-origin `fetch()` the text pedigree and Blob-download it as `pedigree_{ID}.html`. Logged-in fetches aren't redacted for "Living" people.
2. **Parse**: `python3 scripts/parse_pedigree.py pedigree_{ID}.html` writes `data/ancestors_{ID}.json` (schema: ahnentafel, name, pID, events[], generation).
3. **Places**: `node scripts/unresolved.mjs {ID}` lists place strings that can't be resolved. Geocode with `python3 scripts/geocode.py '{"Key":"Place, Region"}'` and add them to `data/places.json`.
4. **Push** from the app dir: `php artisan tree:push ~/projects/fan_chart/data/ancestors_{ID}.json --places=/Users/james/projects/fan_chart/data/places.json`

Requests: `scripts/requests.sh` lists un-emailed requests. `scripts/requests.sh send <id>` emails the requester their link over SMTP via the app's `tree:mail-ready`.

### Parsing gotcha

The text pedigree HTML uses table cells for events, not plain text lines. The `B:`, `P:` etc are inside `<span>` tags in `<td>` elements (`P:` = Place). The regex:
```
&nbsp;(B|M|D|P):(?:&nbsp;)?</span></td>\s*<td[^>]*><span[^>]*>(.*?)(?:&nbsp;)*</span>
```

## Place resolver

- `src/places.js`: strips trailing TNG codes (greedily, right to left), then walks the place string right to left trying progressively broader matches. Farms fall back to their parish or island.
- `data/places.json`: manual coordinate lookup, keyed by the place string with its codes stripped.
- Coordinates are approximate settlement/parish centroids. Verify them: Nominatim gets some Shetland places wrong (multiple "Linga" islands, "Sandwick" in the wrong parish), and returns shire centroids, hills or stations when the town is meant.
- Avoid ambiguous plain keys that would hijack another region's place (e.g. `St. Andrews` is both an Orkney parish and Fife). Scope them, or leave them at county level.
- Sea deaths (At Haaf, At sea, Hoga Baa Ship etc.) all map to a single point west of Shetland (60.3, -2.5).
- Ancestor collapse (same person on both sides of the tree) is handled: the place info panel deduplicates by pID.

## Living people

The app serves anyone with no death event and an earliest dated event within 110 years as "Living" (`Tree::presumedLiving`). `tree:push --living <ID>` also hides an older root. Never put a living person's Bayanne name in an email; `requests.sh` enforces this.

## File structure

```
data/ancestors_{ID}.json — one file per scraped tree (data/ancestors.json = I210520, Marilyn Halcrow)
data/places.json         — shared place name → lat/lng lookup
scripts/parse_pedigree.py, unresolved.mjs, geocode.py, requests.sh
src/app.js, src/places.js, index.html, style.css — original static app
```
