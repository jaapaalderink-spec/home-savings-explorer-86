/**
 * Server-only geocoding van Nederlandse postcodes via de Mapbox connector-gateway.
 * Resultaten worden gecacht in public.postcode_geo zodat elke postcode één keer
 * opgezocht wordt.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/mapbox";

export type PostcodeCoord = { postcode: string; lng: number; lat: number; city: string | null };

/** Normaliseert een postcode naar "1234 AB" of "1234" als de letters ontbreken. */
export function normalizePostcode(raw: string): string | null {
  const clean = (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const match = /^(\d{4})([A-Z]{2})?$/.exec(clean);
  if (!match) return null;
  return match[2] ? `${match[1]} ${match[2]}` : match[1]!;
}

async function geocodeOne(postcode: string): Promise<PostcodeCoord | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapboxKey = process.env["MAPBOX_API_KEY"];
  if (!lovableKey || !mapboxKey) return null;

  const query = encodeURIComponent(`${postcode}, Nederland`);
  let response: Response;
  try {
    response = await fetch(
      `${GATEWAY_URL}/geocoding/v5/mapbox.places/${query}.json?country=nl&types=postcode,place&limit=1`,
      { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapboxKey } },
    );
  } catch (err) {
    console.error(`Geocoding request failed for ${postcode}:`, err);
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    console.error(`Mapbox geocoding failed [${response.status}] for ${postcode}: ${body}`);
    return null;
  }
  const json = (await response.json()) as {
    features?: Array<{ center?: [number, number]; place_name?: string; context?: Array<{ id: string; text: string }> }>;
  };
  const feature = json.features?.[0];
  const center = feature?.center;
  if (!center || center.length !== 2) return null;
  const place = feature?.context?.find((c) => c.id.startsWith("place"))?.text ?? null;
  return { postcode, lng: center[0], lat: center[1], city: place };
}

type Db = Awaited<ReturnType<typeof import("@/lib/partner-util").adminDb>>;

/**
 * Geeft coördinaten voor de opgegeven postcodes. Onbekende postcodes worden
 * (maximaal `maxLookups` per aanroep) opgezocht en in de cache opgeslagen.
 */
export async function resolvePostcodes(
  db: Db,
  postcodes: string[],
  maxLookups = 25,
): Promise<Map<string, PostcodeCoord>> {
  const unique = [...new Set(postcodes)].filter(Boolean);
  const result = new Map<string, PostcodeCoord>();
  if (unique.length === 0) return result;

  const { data: cached } = await db
    .from("postcode_geo")
    .select("postcode, lng, lat, city")
    .in("postcode", unique);
  (cached ?? []).forEach((row) => {
    result.set(row.postcode, {
      postcode: row.postcode,
      lng: Number(row.lng),
      lat: Number(row.lat),
      city: row.city ?? null,
    });
  });

  const missing = unique.filter((p) => !result.has(p)).slice(0, maxLookups);
  if (missing.length === 0) return result;

  const found: PostcodeCoord[] = [];
  for (const postcode of missing) {
    const coord = await geocodeOne(postcode);
    if (coord) {
      found.push(coord);
      result.set(postcode, coord);
    }
  }
  if (found.length > 0) {
    await db.from("postcode_geo").upsert(
      found.map((c) => ({ postcode: c.postcode, lng: c.lng, lat: c.lat, city: c.city })),
      { onConflict: "postcode" },
    );
  }
  return result;
}
