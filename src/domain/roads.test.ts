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

test("official speed zones take precedence over the OSM fallback", () => {
  const road = describeRoad({
    maxspeed: "60",
    speed_limit_kmh: 40,
    speed_source: "DTP Speed Zones",
    speed_source_period: "August 2026",
  });
  assert.equal(road.speed.label, "40 km/h");
  assert.match(road.speed.detail, /DTP Speed Zones/);
});

test("nearby SCATS metrics stay clearly identified as observed site data", () => {
  const road = describeRoad({
    traffic_site_name: "ELIZABETH/VICTORIA",
    traffic_avg_weekday_daily: 12345,
    traffic_am_peak_hour: 987,
    traffic_pm_peak_hour: 876,
    traffic_observation_period: "2026-09-01 to 2026-09-27",
  });
  assert.equal(road.traffic?.daily, "12,345");
  assert.equal(road.traffic?.site, "ELIZABETH/VICTORIA");
});

test("unknown counts remain unknown, even if one directional count exists", () => {
  const road = describeRoad({ lanes_forward: 2, oneway_mode: "two_way" });
  assert.equal(road.laneLabel, "Not recorded");
  assert.match(road.laneDetail, /No lane count/);
});

test("zero is not treated as a missing lane count", () => {
  assert.equal(describeRoad({ lanes_num: 0 }).laneLabel, "0 lanes");
});
