import type { MapData } from "../types";

const datasetNames = [
  "manifest",
  "study_area",
  "buildings",
  "roads",
  "road_lanes",
  "building_info",
  "developments",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Catch missing/malformed files at the boundary instead of failing inside MapLibre.
export function validateDataset(
  name: (typeof datasetNames)[number],
  value: unknown,
): void {
  if (name === "manifest") {
    if (
      !isRecord(value) ||
      !isRecord(value.centre) ||
      typeof value.centre.longitude !== "number" ||
      typeof value.centre.latitude !== "number" ||
      !Number.isFinite(value.centre.longitude) ||
      !Number.isFinite(value.centre.latitude) ||
      typeof value.radius_m !== "number" ||
      !isRecord(value.datasets)
    ) {
      throw new Error("manifest: invalid study-area metadata");
    }
  } else if (
    !isRecord(value) ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features)
  ) {
    throw new Error(`${name}: invalid GeoJSON FeatureCollection`);
  }
}

export async function loadMapData(
  signal: AbortSignal,
  baseUrl = import.meta.env.BASE_URL,
): Promise<MapData> {
  const entries = await Promise.all(
    datasetNames.map(async (name) => {
      const extension = name === "manifest" ? "json" : "geojson";
      const response = await fetch(`${baseUrl}data/${name}.${extension}`, {
        signal,
      });
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      const value: unknown = await response.json();
      validateDataset(name, value);
      return [name, value] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as MapData;
}
