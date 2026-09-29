import test from "node:test";
import assert from "node:assert/strict";
import type { RoadFeature } from "../types";
import { emptyRoadSelection, roadSelectionReducer } from "./selection";

const first: RoadFeature = {
  type: "Feature",
  properties: { osm_id: 1, name: "William Street" },
  geometry: {
    type: "LineString",
    coordinates: [
      [144.95, -37.8],
      [144.951, -37.801],
      [144.952, -37.802],
    ],
  },
};
const second: RoadFeature = {
  ...first,
  properties: { osm_id: 2, name: "William Street" },
};

test("hover previews disappear when leaving a road", () => {
  const preview = roadSelectionReducer(emptyRoadSelection, {
    type: "hover",
    road: first,
  });
  assert.equal(preview.hovered, first);
  assert.equal(preview.selected, null);
  assert.deepEqual(
    roadSelectionReducer(preview, { type: "hover", road: null }),
    emptyRoadSelection,
  );
});

test("a clicked segment keeps its complete geometry and ignores later hover events", () => {
  const selected = roadSelectionReducer(emptyRoadSelection, {
    type: "select",
    road: first,
  });
  assert.equal(selected.selected, first);
  assert.equal(
    roadSelectionReducer(selected, { type: "hover", road: second }),
    selected,
  );
  assert.equal(
    roadSelectionReducer(selected, { type: "hover", road: null }),
    selected,
  );
});

test("clicking a different segment of the same named street switches selection", () => {
  const selected = roadSelectionReducer(emptyRoadSelection, {
    type: "select",
    road: first,
  });
  const switched = roadSelectionReducer(selected, {
    type: "select",
    road: second,
  });
  assert.equal(switched.selected?.properties.osm_id, 2);
  assert.equal(switched.hovered, null);
});

test("clearing selection discards the old road and enables hover previews again", () => {
  const selected = roadSelectionReducer(emptyRoadSelection, {
    type: "select",
    road: first,
  });
  const cleared = roadSelectionReducer(selected, { type: "clear" });
  assert.deepEqual(cleared, emptyRoadSelection);
  assert.equal(
    roadSelectionReducer(cleared, { type: "hover", road: second }).hovered,
    second,
  );
});
