/**
 * Place resolver for TNG genealogy place strings.
 *
 * TNG format: "specific_place, parish, county_code, country_code"
 * e.g. "Backaburn, Hamnavoe, Burra, SHI, SCT"
 *
 * Resolves by walking the place string right-to-left, trying progressively
 * more specific matches until it finds coordinates in the lookup.
 */

export async function loadPlaces() {
  const resp = await fetch('./data/places.json');
  const data = await resp.json();
  return data.places;
}

/**
 * Resolve a TNG place string to { lat, lng, matchedKey, precision }.
 *
 * Strategy: strip known codes (SHI, SCT, etc), then try the full remaining
 * string, then progressively drop the leftmost part (most specific) until
 * we get a match. This means "Backaburn, Hamnavoe, Burra" tries:
 *   1. "Backaburn, Hamnavoe, Burra"
 *   2. "Hamnavoe, Burra"
 *   3. "Burra"
 *
 * Returns null if no match found.
 */
const KNOWN_CODES = new Set(['SHI', 'SCT', 'ORK', 'ENG', 'WAL', 'IRE', 'NIR']);

export function resolvePlace(placeString, lookup) {
  if (!placeString) return null;

  // Split and trim parts
  const parts = placeString.split(',').map(p => p.trim()).filter(Boolean);

  // Strip known codes from the end, but remember them for context
  const codes = [];
  while (parts.length > 0 && KNOWN_CODES.has(parts[parts.length - 1].replace('?', ''))) {
    codes.unshift(parts.pop());
  }

  if (parts.length === 0) {
    // Only had codes - try the first code (e.g. "SHI")
    if (codes.length > 0 && lookup[codes[0]]) {
      const match = lookup[codes[0]];
      return { lat: match.lat, lng: match.lng, matchedKey: codes[0], precision: 'county' };
    }
    return null;
  }

  // Try progressively less specific matches
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join(', ');
    if (lookup[candidate]) {
      const match = lookup[candidate];
      return {
        lat: match.lat,
        lng: match.lng,
        matchedKey: candidate,
        precision: i === 0 ? 'exact' : 'parent',
        type: match.type
      };
    }
  }

  // Last resort: try individual parts (rightmost first = broadest)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (lookup[parts[i]]) {
      const match = lookup[parts[i]];
      return {
        lat: match.lat,
        lng: match.lng,
        matchedKey: parts[i],
        precision: 'fallback',
        type: match.type
      };
    }
  }

  // Try county code
  if (codes.length > 0 && lookup[codes[0]]) {
    const match = lookup[codes[0]];
    return { lat: match.lat, lng: match.lng, matchedKey: codes[0], precision: 'county' };
  }

  return null;
}

/**
 * Find all place strings in the dataset that can't be resolved.
 * Useful for building out the lookup incrementally.
 */
export function findUnresolved(ancestors, lookup) {
  const unresolved = new Map(); // place string -> count
  for (const person of ancestors) {
    for (const event of person.events || []) {
      if (event.place && event.place !== 'UNKNOWN') {
        const result = resolvePlace(event.place, lookup);
        if (!result || result.precision === 'county') {
          const count = unresolved.get(event.place) || 0;
          unresolved.set(event.place, count + 1);
        }
      }
    }
  }
  return [...unresolved.entries()].sort((a, b) => b[1] - a[1]);
}
