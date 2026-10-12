/** Plaats zoeken in de browser met de publieke kaartsleutel; alleen een resultaat kan middelpunt worden. */
const TOKEN = import.meta.env["VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN"] as string | undefined;

export type PlaceResult = { id: string; label: string; lat: number; lng: number };

export async function searchPlaces(q: string): Promise<PlaceResult[]> {
  if (!TOKEN) throw new Error("Plaatsen zoeken is nu niet beschikbaar.");
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=nl&types=place,locality,postcode&language=nl&limit=6&access_token=${TOKEN}`,
  );
  if (!res.ok) throw new Error("Plaatsen zoeken is mislukt.");
  const json = (await res.json()) as {
    features?: Array<{ id: string; center?: [number, number]; place_name?: string }>;
  };
  return (json.features ?? [])
    .filter((f) => f.center?.length === 2)
    .map((f) => ({
      id: f.id,
      label: (f.place_name ?? "").replace(/, Nederland$/, ""),
      lng: f.center![0],
      lat: f.center![1],
    }));
}
