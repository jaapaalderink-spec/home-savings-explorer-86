/**
 * Geocoding van Nederlandse postcodes in de browser met de publieke Mapbox-token.
 * Resultaten worden in localStorage gecacht zodat elke postcode één keer opgezocht wordt.
 */
const CACHE_KEY = "postcode-geo-v1";

type Cache = Record<string, [number, number]>;

function readCache(): Cache {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}") as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota vol of privémodus: cache is optioneel */
  }
}

/**
 * Zoekt coördinaten voor postcodes op. Geeft een map terug van postcode naar [lng, lat].
 * Al bekende postcodes komen direct uit de cache.
 */
export async function geocodePostcodes(
  postcodes: string[],
  token: string,
  max = 60,
): Promise<Cache> {
  const cache = readCache();
  const missing = [...new Set(postcodes)].filter((p) => p && !cache[p]).slice(0, max);
  let changed = false;

  for (const postcode of missing) {
    const query = encodeURIComponent(`${postcode}, Nederland`);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?country=nl&types=postcode,place,locality&limit=1&access_token=${token}`,
      );
      if (!res.ok) {
        console.error(`Geocoding mislukt [${res.status}] voor ${postcode}`);
        continue;
      }
      const json = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
      const center = json.features?.[0]?.center;
      if (center && center.length === 2) {
        cache[postcode] = [center[0], center[1]];
        changed = true;
      }
    } catch (err) {
      console.error(`Geocoding mislukt voor ${postcode}:`, err);
    }
  }

  if (changed) writeCache(cache);
  return cache;
}
