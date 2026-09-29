import test from "node:test";
import assert from "node:assert/strict";
import type { RoadFeature } from "../types";
import { buildStraightRoadSection } from "./corridor";

function road(
  osmId: number,
  coordinates: [number, number][],
  lanes = 2,
  name = "Elizabeth Street",
): RoadFeature {
  return {
    type: "Feature",
    properties: {
      osm_id: osmId,
      name,
      lanes_num: lanes,
      oneway_mode: "forward",
    },
    geometry: { type: "LineString", coordinates },
  };
}

test("a clicked OSM fragment expands in both directions along a straight road", () => {
  const before = road(1, [
    [144.95, -37.799],
    [144.95, -37.8],
  ]);
  const selected = road(2, [
    [144.95, -37.8],
    [144.95, -37.801],
  ]);
  const after = road(3, [
    [144.95, -37.801],
    [144.95, -37.802],
  ]);
  const section = buildStraightRoadSection(selected, [after, selected, before]);
  assert.deepEqual(section.geometry.coordinates, [
    [144.95, -37.799],
    [144.95, -37.8],
    [144.95, -37.801],
    [144.95, -37.802],
  ]);
  assert.equal(section.properties.selection_segment_count, 3);
  assert.ok((section.properties.selection_length_m ?? 0) > 300);
});

test("expansion crosses lane-tag changes but retains the clicked segment lane count", () => {
  const selected = road(1, [
    [144.95, -37.8],
    [144.95, -37.801],
  ]);
  const laneChange = road(
    2,
    [
      [144.95, -37.801],
      [144.95, -37.802],
    ],
    3,
  );
  const section = buildStraightRoadSection(selected, [selected, laneChange]);
  assert.equal(section.geometry.coordinates.length, 3);
  assert.equal(section.properties.selection_segment_count, 2);
  assert.equal(section.properties.lanes_num, 2);
});

test("expansion ignores a turning branch", () => {
  const selected = road(1, [
    [144.95, -37.8],
    [144.95, -37.801],
  ]);
  const turningBranch = road(3, [
    [144.95, -37.801],
    [144.951, -37.801],
  ]);
  const section = buildStraightRoadSection(selected, [selected, turningBranch]);
  assert.deepEqual(section.geometry, selected.geometry);
  assert.equal(section.properties.selection_segment_count, 1);
});
