import test from "node:test";
import assert from "node:assert/strict";
import type { LineString } from "geojson";
import { snapToRoad, sliceRoad, rangeLength } from "./workRange";
import { emptyRoadSelection, roadSelectionReducer } from "./selection";
import type { RoadFeature } from "../types";

const bend: LineString = {
  type: "LineString",
  coordinates: [
    [144.95, -37.8],
    [144.951, -37.8],
    [144.951, -37.799],
  ],
};
const road: RoadFeature = {
  type: "Feature",
  properties: { osm_id: 1 },
  geometry: bend,
};
const a = snapToRoad(bend, [144.9505, -37.8001]);
const b = snapToRoad(bend, [144.9511, -37.7995]);

test("snaps off-road clicks onto the line and clamps beyond the endpoints", () => {
  assert.deepEqual(a.coordinates, [144.9505, -37.8]);
  assert.deepEqual(b.coordinates, [144.951, -37.7995]);
  assert.deepEqual(
    snapToRoad(bend, [144.949, -37.8]).coordinates,
    bend.coordinates[0],
  );
  assert.deepEqual(
    snapToRoad(bend, [144.951, -37.798]).coordinates,
    bend.coordinates[2],
  );
});

test("partial range follows the bend and measures along the road in either click order", () => {
  const range = { start: a, end: b };
  assert.deepEqual(sliceRoad(bend, range)?.coordinates, [
    a.coordinates,
    bend.coordinates[1],
    b.coordinates,
  ]);
  assert.ok(Math.abs(rangeLength(range)! - 99.53) < 0.2);
  assert.deepEqual(
    sliceRoad(bend, { start: b, end: a }),
    sliceRoad(bend, range),
  );
  assert.equal(rangeLength({ start: b, end: a }), rangeLength(range));
});

test("duplicate vertices do not break snapping and exact endpoints preserve the full line", () => {
  const line: LineString = {
    ...bend,
    coordinates: [bend.coordinates[0], ...bend.coordinates],
  };
  assert.deepEqual(snapToRoad(line, a.coordinates), a);
  assert.deepEqual(
    sliceRoad(bend, {
      start: snapToRoad(bend, bend.coordinates[0]),
      end: snapToRoad(bend, bend.coordinates[2]),
    }),
    bend,
  );
  assert.equal(sliceRoad(bend, { start: a, end: null }), null);
});

function completedSelection() {
  let state = roadSelectionReducer(emptyRoadSelection, {
    type: "select",
    road,
  });
  state = roadSelectionReducer(state, {
    type: "pick-endpoint",
    endpoint: "start",
  });
  state = roadSelectionReducer(state, { type: "place-endpoint", point: a });
  assert.equal(state.picking, "end");
  return roadSelectionReducer(state, { type: "place-endpoint", point: b });
}

test("range editing rejects overlapping endpoints, supports moving one endpoint and keeps original geometry", () => {
  const state = completedSelection();
  assert.equal(state.picking, null);
  assert.equal(state.selected, road);
  const editing = roadSelectionReducer(state, {
    type: "pick-endpoint",
    endpoint: "start",
  });
  const rejected = roadSelectionReducer(editing, {
    type: "place-endpoint",
    point: b,
  });
  assert.equal(rejected.range, state.range);
  assert.ok(rejected.rangeError);
  assert.equal(rejected.picking, "start");
  const changed = roadSelectionReducer(rejected, {
    type: "place-endpoint",
    point: snapToRoad(bend, bend.coordinates[0]),
  });
  assert.equal(changed.range.end, b);
  assert.equal(changed.range.start?.distance, 0);
  assert.equal(changed.rangeError, null);
  assert.equal(changed.selected?.geometry, bend);
});

test("reset, switching roads and clearing remove the range; reselecting the same road keeps it", () => {
  const state = completedSelection();
  assert.equal(roadSelectionReducer(state, { type: "select", road }), state);
  const reset = roadSelectionReducer(state, { type: "reset-range" });
  assert.equal(reset.selected, road);
  assert.deepEqual(reset.range, emptyRoadSelection.range);
  const switched = roadSelectionReducer(state, {
    type: "select",
    road: { ...road, properties: { osm_id: 2 } },
  });
  assert.deepEqual(switched.range, emptyRoadSelection.range);
  assert.deepEqual(
    roadSelectionReducer(state, { type: "clear" }),
    emptyRoadSelection,
  );
});

test("cancel preserves a complete range but discards unfinished placement", () => {
  const state = completedSelection();
  const editing = roadSelectionReducer(state, {
    type: "pick-endpoint",
    endpoint: "end",
  });
  assert.deepEqual(
    roadSelectionReducer(editing, { type: "cancel-pick" }),
    state,
  );
  const partial = { ...editing, range: { start: a, end: null } };
  assert.deepEqual(
    roadSelectionReducer(partial, { type: "cancel-pick" }).range,
    emptyRoadSelection.range,
  );
});
