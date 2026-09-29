import test from "node:test";
import assert from "node:assert/strict";
import { describeRoad } from "./roads";

test("two-way lane counts remain a total, never an invented directional split", () => {
  const road = describeRoad({ lanes_num: 3, oneway_mode: "two_way" });
  assert.equal(road.laneLabel, "3 lanes");
  assert.equal(road.laneDetail, "3 lanes total across both directions.");
});

test("reverse one-way roads use the recorded permitted heading", () => {
  const road = describeRoad({
    lanes_num: 1,
    oneway_mode: "reverse",
    travel_heading: "S",
    geometry_forward_heading: "N",
  });
  assert.equal(road.laneLabel, "1 lane");
  assert.equal(road.laneDetail, "1 lane in the permitted S direction.");
  assert.deepEqual(road.fields, [["Direction", "One-way"]]);
});

test("unknown counts remain unknown, even if one directional count exists", () => {
  const road = describeRoad({ lanes_forward: 2, oneway_mode: "two_way" });
  assert.equal(road.laneLabel, "Not recorded");
  assert.match(road.laneDetail, /No lane count/);
});

test("zero is not treated as a missing lane count", () => {
  assert.equal(describeRoad({ lanes_num: 0 }).laneLabel, "0 lanes");
});
