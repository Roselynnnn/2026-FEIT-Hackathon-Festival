import type { Position, LineString } from "geojson";

export interface RoadPoint {
  coordinates: [number, number];
  distance: number;
}

export interface WorkRange {
  start: RoadPoint | null;
  end: RoadPoint | null;
}

const radians = Math.PI / 180;

function metres(a: Position, b: Position) {
  const lat = Math.sin(((b[1] - a[1]) * radians) / 2);
  const lon = Math.sin(((b[0] - a[0]) * radians) / 2);
  const h =
    lat * lat + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * lon * lon;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Local metric projection for snapping within the Melbourne study area.
// Distances along the original line use great-circle lengths.
export function snapToRoad(line: LineString, point: Position): RoadPoint {
  const longitudeScale = Math.cos(point[1] * radians);
  let nearest = Infinity;
  let travelled = 0;
  let result: RoadPoint = {
    coordinates: [line.coordinates[0][0], line.coordinates[0][1]],
    distance: 0,
  };
  for (let i = 1; i < line.coordinates.length; i++) {
    const a = line.coordinates[i - 1];
    const b = line.coordinates[i];
    const dx = (b[0] - a[0]) * longitudeScale;
    const dy = b[1] - a[1];
    const squared = dx * dx + dy * dy;
    const t =
      squared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * longitudeScale * dx +
                (point[1] - a[1]) * dy) /
                squared,
            ),
          );
    const coordinates: [number, number] = [
      a[0] + t * (b[0] - a[0]),
      a[1] + t * (b[1] - a[1]),
    ];
    const distanceToPoint =
      ((point[0] - coordinates[0]) * longitudeScale) ** 2 +
      (point[1] - coordinates[1]) ** 2;
    const length = metres(a, b);
    if (distanceToPoint < nearest) {
      nearest = distanceToPoint;
      result = { coordinates, distance: travelled + t * length };
    }
    travelled += length;
  }
  return result;
}

export function rangeLength(range: WorkRange) {
  return range.start && range.end
    ? Math.abs(range.end.distance - range.start.distance)
    : null;
}

export function sliceRoad(
  line: LineString,
  range: WorkRange,
): LineString | null {
  if (!range.start || !range.end) return null;
  const [start, end] =
    range.start.distance <= range.end.distance
      ? [range.start, range.end]
      : [range.end, range.start];
  const coordinates: Position[] = [start.coordinates];
  let travelled = 0;
  for (let i = 1; i < line.coordinates.length; i++) {
    travelled += metres(line.coordinates[i - 1], line.coordinates[i]);
    if (travelled > start.distance && travelled < end.distance)
      coordinates.push(line.coordinates[i]);
  }
  coordinates.push(end.coordinates);
  return { type: "LineString", coordinates };
}
