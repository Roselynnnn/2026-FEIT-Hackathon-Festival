import test from "node:test";
import assert from "node:assert/strict";
import { emptyRoadSelection, roadSelectionReducer } from "./selection";
import {
  emptyRestrictions,
  restrictionErrors,
  restrictionSummary,
} from "./restrictions";
import type { RoadFeature } from "../types";

const road: RoadFeature = {
  type: "Feature",
  properties: { osm_id: 1, lanes_num: 2, speed_limit_kmh: 50 },
  geometry: {
    type: "LineString",
    coordinates: [
      [144.95, -37.8],
      [144.951, -37.8],
    ],
  },
};

function ready() {
  let state = roadSelectionReducer(emptyRoadSelection, {
    type: "select",
    road,
  });
  state = roadSelectionReducer(state, {
    type: "pick-endpoint",
    endpoint: "start",
  });
  state = roadSelectionReducer(state, {
    type: "place-endpoint",
    point: { coordinates: [144.95, -37.8], distance: 0 },
  });
  return roadSelectionReducer(state, {
    type: "place-endpoint",
    point: { coordinates: [144.9505, -37.8], distance: 44 },
  });
}

test("restrictions need a complete range, and partial closure needs a known multi-lane road", () => {
  const selected = roadSelectionReducer(emptyRoadSelection, {
    type: "select",
    road,
  });
  assert.equal(
    roadSelectionReducer(selected, { type: "set-access", access: "closed" }),
    selected,
  );
  assert.equal(
    roadSelectionReducer(selected, { type: "toggle-speed", enabled: true }),
    selected,
  );
  for (const lanes_num of [undefined, 1]) {
    const state = {
      ...ready(),
      selected: { ...road, properties: { ...road.properties, lanes_num } },
    };
    assert.equal(
      roadSelectionReducer(state, { type: "set-access", access: "partial" }),
      state,
    );
    assert.equal(
      roadSelectionReducer(state, { type: "set-access", access: "closed" })
        .restrictions.access,
      "closed",
    );
  }
});

test("partial closure and speed combine; full closure clears incompatible settings", () => {
  let state = roadSelectionReducer(ready(), {
    type: "set-access",
    access: "partial",
  });
  state = roadSelectionReducer(state, { type: "toggle-speed", enabled: true });
  assert.equal(restrictionSummary(state.restrictions, road.properties), null);
  state = roadSelectionReducer(state, { type: "set-speed", speed: 20 });
  assert.equal(
    restrictionSummary(state.restrictions, road.properties),
    "Close 1 / 2 lanes · 20 km/h",
  );
  const open = roadSelectionReducer(state, {
    type: "set-access",
    access: "open",
  });
  assert.equal(open.restrictions.closedLanes, null);
  assert.equal(open.restrictions.speedKmh, 20);
  const closed = roadSelectionReducer(state, {
    type: "set-access",
    access: "closed",
  });
  assert.deepEqual(closed.restrictions, {
    ...emptyRestrictions,
    access: "closed",
  });
  assert.equal(
    restrictionSummary(closed.restrictions, road.properties),
    "Full road closure",
  );
  assert.equal(
    roadSelectionReducer(closed, { type: "toggle-speed", enabled: true }),
    closed,
  );
  assert.deepEqual(
    roadSelectionReducer(closed, { type: "set-access", access: "open" })
      .restrictions,
    emptyRestrictions,
  );
});

test("invalid lane counts and speeds remain incomplete rather than appearing in a valid summary", () => {
  const partial = { ...emptyRestrictions, access: "partial" as const };
  for (const closedLanes of [null, 0, -1, 1.5, 2, 3, NaN]) {
    assert.ok(
      restrictionErrors({ ...partial, closedLanes }, road.properties).laneError,
    );
    assert.equal(
      restrictionSummary({ ...partial, closedLanes }, road.properties),
      null,
    );
  }
  for (const speedKmh of [null, 0, -20, 20.5, 51, NaN]) {
    assert.ok(
      restrictionErrors(
        { ...emptyRestrictions, speedEnabled: true, speedKmh },
        road.properties,
      ).speedError,
    );
  }
  assert.equal(
    restrictionErrors(
      { ...emptyRestrictions, speedEnabled: true, speedKmh: 50 },
      road.properties,
    ).speedError,
    null,
  );
  assert.ok(
    restrictionErrors(
      { ...emptyRestrictions, speedEnabled: true, speedKmh: 40 },
      { maxspeed: "30" },
    ).speedError,
  );
});

test("moving endpoints preserves restrictions; resetting the range or switching roads clears them", () => {
  const state = roadSelectionReducer(ready(), {
    type: "set-access",
    access: "partial",
  });
  const editing = roadSelectionReducer(state, {
    type: "pick-endpoint",
    endpoint: "end",
  });
  const moved = roadSelectionReducer(editing, {
    type: "place-endpoint",
    point: { coordinates: [144.9503, -37.8], distance: 26 },
  });
  assert.equal(moved.restrictions, state.restrictions);
  assert.equal(
    roadSelectionReducer(editing, { type: "cancel-pick" }).restrictions,
    state.restrictions,
  );
  assert.deepEqual(
    roadSelectionReducer(state, { type: "reset-range" }).restrictions,
    emptyRestrictions,
  );
  assert.deepEqual(
    roadSelectionReducer(state, {
      type: "select",
      road: { ...road, properties: { ...road.properties, osm_id: 2 } },
    }).restrictions,
    emptyRestrictions,
  );
  assert.deepEqual(
    roadSelectionReducer(state, { type: "clear" }),
    emptyRoadSelection,
  );
});
