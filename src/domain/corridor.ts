import type { Position } from "geojson";
import type { RoadFeature, RoadProperties } from "../types";

const radians = Math.PI / 180;
const endpointToleranceMetres = 4;
const maximumTurnDegrees = 35;
const maximumSegments = 80;

function metres(a: Position, b: Position) {
  const latitude = ((a[1] + b[1]) / 2) * radians;
  return Math.hypot(
    (a[0] - b[0]) * 111_320 * Math.cos(latitude),
    (a[1] - b[1]) * 110_540,
  );
}

function roadName(properties: RoadProperties) {
  return (properties.name ?? properties.seg_descr ?? properties.featurenam ?? "")
    .trim()
    .toLocaleLowerCase("en-AU");
}

function compatible(seed: RoadFeature, candidate: RoadFeature) {
  const name = roadName(seed.properties);
  return (
    name !== "" &&
    roadName(candidate.properties) === name &&
    candidate.properties.oneway_mode === seed.properties.oneway_mode
  );
}

function turnDegrees(a: Position, joint: Position, b: Position) {
  const scale = Math.cos(joint[1] * radians);
  const incoming = [(joint[0] - a[0]) * scale, joint[1] - a[1]];
  const outgoing = [(b[0] - joint[0]) * scale, b[1] - joint[1]];
  const denominator = Math.hypot(...incoming) * Math.hypot(...outgoing);
  if (denominator === 0) return 180;
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        denominator,
    ),
  );
  return (Math.acos(cosine) / Math.PI) * 180;
}

interface Extension {
  road: RoadFeature;
  coordinates: Position[];
  turn: number;
}

function bestExtension(
  seed: RoadFeature,
  roads: RoadFeature[],
  used: Set<number | undefined>,
  coordinates: Position[],
  atStart: boolean,
): Extension | null {
  const joint = atStart ? coordinates[0] : coordinates.at(-1)!;
  let best: Extension | null = null;
  for (const road of roads) {
    if (used.has(road.properties.osm_id) || !compatible(seed, road)) continue;
    const source = road.geometry.coordinates;
    if (source.length < 2) continue;
    for (const reverse of [false, true]) {
      const candidate = reverse ? [...source].reverse() : source;
      const touching = atStart ? candidate.at(-1)! : candidate[0];
      if (metres(joint, touching) > endpointToleranceMetres) continue;
      const turn = atStart
        ? turnDegrees(candidate.at(-2)!, joint, coordinates[1])
        : turnDegrees(coordinates.at(-2)!, joint, candidate[1]);
      if (turn > maximumTurnDegrees) continue;
      if (!best || turn < best.turn)
        best = { road, coordinates: candidate, turn };
    }
  }
  return best;
}

function lengthMetres(coordinates: Position[]) {
  return coordinates
    .slice(1)
    .reduce((total, point, index) => total + metres(coordinates[index], point), 0);
}

/**
 * Joins OSM fragments into one usable planning section. Expansion only follows
 * the straightest connected continuation with the same road name and direction
 * model. OSM often changes lane tags at intersections, so lane-count changes do
 * not break the selectable planning section; restrictions retain the mapped
 * lane count at the exact segment the user clicked.
 */
export function buildStraightRoadSection(
  seed: RoadFeature,
  roads: RoadFeature[],
): RoadFeature {
  const used = new Set<number | undefined>([seed.properties.osm_id]);
  let coordinates: Position[] = [...seed.geometry.coordinates];

  for (const atStart of [true, false]) {
    while (used.size < maximumSegments) {
      const extension = bestExtension(seed, roads, used, coordinates, atStart);
      if (!extension) break;
      used.add(extension.road.properties.osm_id);
      coordinates = atStart
        ? [...extension.coordinates.slice(0, -1), ...coordinates]
        : [...coordinates, ...extension.coordinates.slice(1)];
    }
  }

  return {
    ...seed,
    properties: {
      ...seed.properties,
      selection_segment_count: used.size,
      selection_length_m: lengthMetres(coordinates),
    },
    geometry: { type: "LineString", coordinates },
  };
}
