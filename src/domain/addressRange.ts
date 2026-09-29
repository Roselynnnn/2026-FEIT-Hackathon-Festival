import type { Position } from "geojson";
import type { AddressFeature, RoadFeature } from "../types";
import { buildStraightRoadSection } from "./corridor";
import { snapToRoad, type WorkRange } from "./workRange";

const radians = Math.PI / 180;
const streetTypePattern =
  "Street|Road|Lane|Way|Place|Parade|Avenue|Drive|Boulevard|Terrace|Highway";

interface ParsedAddress {
  number: number;
  streetKey: string;
  streetLabel: string;
}

interface AddressRecord {
  start: number;
  end: number;
  number: number;
  coordinates: [number, number];
}

export interface AddressRangePlan {
  road: RoadFeature;
  range: WorkRange;
  fromLabel: string;
  toLabel: string;
}

function normalizeStreet(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(new RegExp(`\\b(?:${streetTypePattern})\\b`, "gi"), "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseAddress(value: string): ParsedAddress {
  const match = value
    .trim()
    .match(/^(\d+)[a-z]?\s+(.+?)(?:,\s*.+)?$/i);
  if (!match)
    throw new Error("Enter a street number and name, for example 160 Victoria Street.");
  const streetLabel = match[2].trim();
  const streetKey = normalizeStreet(streetLabel);
  if (!streetKey) throw new Error("Enter a valid street name.");
  return { number: Number(match[1]), streetKey, streetLabel };
}

function parsePublishedAddress(value: string): {
  start: number;
  end: number;
  streetKey: string;
} | null {
  const match = value.match(
    new RegExp(
      `(?:^|\\s)(\\d+)[A-Z]?(?:-(\\d+)[A-Z]?)?\\s+([A-Z][A-Z '\\-]+?\\s(?:${streetTypePattern}))\\b`,
      "i",
    ),
  );
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2] ?? match[1]),
    streetKey: normalizeStreet(match[3]),
  };
}

function addressRecords(
  streetKey: string,
  features: AddressFeature[],
): AddressRecord[] {
  const records: AddressRecord[] = [];
  for (const feature of features) {
    const published = parsePublishedAddress(
      feature.properties.street_address ?? "",
    );
    if (!published || published.streetKey !== streetKey) continue;
    records.push({
      start: published.start,
      end: published.end,
      number: (published.start + published.end) / 2,
      coordinates: feature.geometry.coordinates as [number, number],
    });
  }
  return records.sort((a, b) => a.number - b.number);
}

function nearestNumberAnchor(number: number, records: AddressRecord[]) {
  const containing = records.filter(
    (record) => number >= record.start && number <= record.end,
  );
  const candidates = containing.length ? containing : records;
  return [...candidates].sort((a, b) => {
    const numberDifference =
      Math.abs(a.number - number) - Math.abs(b.number - number);
    return numberDifference || a.end - a.start - (b.end - b.start);
  })[0];
}

function interpolateAroundAnchor(
  number: number,
  anchor: AddressRecord,
  records: AddressRecord[],
): [number, number] {
  const nearby = records.filter(
    (record) => record !== anchor && metres(anchor.coordinates, record.coordinates) < 350,
  );
  const lower = nearby
    .filter((record) => record.number < anchor.number)
    .sort(
      (a, b) =>
        metres(anchor.coordinates, a.coordinates) -
        metres(anchor.coordinates, b.coordinates),
    )[0];
  const upper = nearby
    .filter((record) => record.number > anchor.number)
    .sort(
      (a, b) =>
        metres(anchor.coordinates, a.coordinates) -
        metres(anchor.coordinates, b.coordinates),
    )[0];
  if (!lower && !upper) return anchor.coordinates;
  const start = lower ?? anchor;
  const end = upper ?? anchor;
  if (start.number === end.number) return anchor.coordinates;
  const ratio = (number - start.number) / (end.number - start.number);
  return [
    start.coordinates[0] + ratio * (end.coordinates[0] - start.coordinates[0]),
    start.coordinates[1] + ratio * (end.coordinates[1] - start.coordinates[1]),
  ];
}

function metres(a: Position, b: Position) {
  const latitude = ((a[1] + b[1]) / 2) * radians;
  return Math.hypot(
    (a[0] - b[0]) * 111_320 * Math.cos(latitude),
    (a[1] - b[1]) * 110_540,
  );
}

function roadName(road: RoadFeature) {
  return normalizeStreet(
    road.properties.name ??
      road.properties.seg_descr ??
      road.properties.featurenam ??
      "",
  );
}

export function planAddressRange(
  fromValue: string,
  toValue: string,
  addresses: AddressFeature[],
  roads: RoadFeature[],
): AddressRangePlan {
  const from = parseAddress(fromValue);
  const to = parseAddress(toValue);
  if (from.streetKey !== to.streetKey)
    throw new Error("Start and end addresses must be on the same street.");
  const records = addressRecords(from.streetKey, addresses);
  if (records.length < 2)
    throw new Error(`Not enough local address data for ${from.streetLabel}.`);
  const minimum = Math.min(...records.map((record) => record.start));
  const maximum = Math.max(...records.map((record) => record.end));
  for (const address of [from, to]) {
    if (address.number < minimum || address.number > maximum)
      throw new Error(
        `${address.number} ${address.streetLabel} is outside the available 1 km address data.`,
      );
  }
  let fromAnchor = nearestNumberAnchor(from.number, records);
  let toAnchor = nearestNumberAnchor(to.number, records);
  const fromContaining = records.filter(
    (record) => from.number >= record.start && from.number <= record.end,
  );
  const toContaining = records.filter(
    (record) => to.number >= record.start && to.number <= record.end,
  );
  if (fromContaining.length && toContaining.length) {
    const pairs = fromContaining.flatMap((a) =>
      toContaining.map((b) => ({ a, b, distance: metres(a.coordinates, b.coordinates) })),
    );
    pairs.sort((a, b) => a.distance - b.distance);
    fromAnchor = pairs[0].a;
    toAnchor = pairs[0].b;
  }
  const fromCoordinates = interpolateAroundAnchor(
    from.number,
    fromAnchor,
    records,
  );
  const toCoordinates = interpolateAroundAnchor(to.number, toAnchor, records);
  const midpoint: [number, number] = [
    (fromCoordinates[0] + toCoordinates[0]) / 2,
    (fromCoordinates[1] + toCoordinates[1]) / 2,
  ];
  const matching = roads.filter((road) => roadName(road) === from.streetKey);
  if (!matching.length)
    throw new Error(`No mapped road was found for ${from.streetLabel}.`);
  let seed = matching[0];
  let nearest = Infinity;
  for (const road of matching) {
    const snapped = snapToRoad(road.geometry, midpoint);
    const distance = metres(midpoint, snapped.coordinates);
    if (distance < nearest) {
      nearest = distance;
      seed = road;
    }
  }
  if (nearest > 120)
    throw new Error("The matched addresses are too far from the mapped road.");
  const road = buildStraightRoadSection(seed, roads);
  const start = snapToRoad(road.geometry, fromCoordinates);
  const end = snapToRoad(road.geometry, toCoordinates);
  if (Math.abs(start.distance - end.distance) < 1)
    throw new Error("The two addresses resolve to the same point. Use a wider range.");
  return {
    road,
    range: { start, end },
    fromLabel: `${from.number} ${from.streetLabel}`,
    toLabel: `${to.number} ${to.streetLabel}`,
  };
}
