import test from "node:test";
import assert from "node:assert/strict";
import { describeCongestion, formatTrafficTime } from "./traffic";

test("traffic interval labels cover the whole day in 15 minute steps", () => {
  assert.equal(formatTrafficTime(0), "00:00");
  assert.equal(formatTrafficTime(32), "08:00");
  assert.equal(formatTrafficTime(95), "23:45");
});

test("congestion labels use stable relative-demand bands", () => {
  assert.equal(describeCongestion(undefined).label, "No observed data");
  assert.equal(describeCongestion(20).label, "Low");
  assert.equal(describeCongestion(50).label, "Moderate");
  assert.equal(describeCongestion(70).label, "High");
  assert.equal(describeCongestion(90).label, "Very high");
});
