import test from "node:test";
import assert from "node:assert/strict";
import type { RoadProperties } from "../types";
import { emptyRestrictions } from "./restrictions";
import {
  formatConstructionWindow,
  recommendBackupWindows,
  scoreConstructionWindow,
} from "./timing";

const weekday = Array(96).fill(180) as number[];
weekday.splice(32, 4, 700, 720, 710, 690);
weekday.splice(8, 4, 40, 50, 45, 35);
const weekend = Array(96).fill(140) as number[];
weekend.splice(12, 4, 20, 25, 20, 15);

const road: RoadProperties = {
  lanes_num: 2,
  speed_limit_kmh: 60,
  traffic_weekday_profile: weekday,
  traffic_weekend_profile: weekend,
};

test("busy construction windows score lower than quiet windows", () => {
  const busy = scoreConstructionWindow(road, emptyRestrictions, 32, "weekday");
  const quiet = scoreConstructionWindow(road, emptyRestrictions, 8, "weekday");
  assert.ok(busy && quiet);
  assert.ok(quiet.score > busy.score);
  assert.equal(busy.verdict, "Avoid this window");
});

test("more disruptive restrictions reduce the same window score", () => {
  const open = scoreConstructionWindow(road, emptyRestrictions, 8, "weekday");
  const partial = scoreConstructionWindow(
    road,
    { ...emptyRestrictions, access: "partial", closedLanes: 1 },
    8,
    "weekday",
  );
  const closed = scoreConstructionWindow(
    road,
    { ...emptyRestrictions, access: "closed" },
    8,
    "weekday",
  );
  assert.ok(open && partial && closed);
  assert.ok(open.score > partial.score);
  assert.ok(partial.score > closed.score);
});

test("the two lightest non-current hourly windows become backups", () => {
  const backups = recommendBackupWindows(
    road,
    emptyRestrictions,
    32,
    "weekday",
  );
  assert.equal(backups.length, 2);
  assert.equal(backups[0].label, "Weekend 03:00–04:00");
  assert.equal(backups[0].averageVolume, 20);
  assert.equal(backups[1].label, "Weekday 02:00–03:00");
  assert.equal(backups[1].averageVolume, 43);
  assert.equal(formatConstructionWindow(92), "23:00–00:00");
});

test("missing traffic or invalid restrictions do not invent a score", () => {
  assert.equal(
    scoreConstructionWindow({ lanes_num: 2 }, emptyRestrictions, 0, "weekday"),
    null,
  );
  assert.deepEqual(
    recommendBackupWindows(
      road,
      { ...emptyRestrictions, access: "partial", closedLanes: 2 },
      0,
      "weekday",
    ),
    [],
  );
});

test("construction duration changes the score and backup window length", () => {
  const oneHour = scoreConstructionWindow(
    road,
    emptyRestrictions,
    8,
    "weekday",
    4,
  );
  const fourHours = scoreConstructionWindow(
    road,
    emptyRestrictions,
    8,
    "weekday",
    16,
  );
  assert.ok(oneHour && fourHours);
  assert.ok(oneHour.score > fourHours.score);

  const backups = recommendBackupWindows(
    road,
    emptyRestrictions,
    32,
    "weekday",
    16,
  );
  assert.equal(backups.length, 2);
  assert.match(backups[0].label, /\d\d:\d\d–\d\d:\d\d/);
  assert.equal(formatConstructionWindow(8, 16), "02:00–06:00");
});
