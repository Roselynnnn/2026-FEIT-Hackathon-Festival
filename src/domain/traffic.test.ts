import test from "node:test";
import assert from "node:assert/strict";
import {
  describeCapacityLoad,
  estimatedCapacityLoad,
  estimatedCapacityPerInterval,
  formatTrafficTime,
  trafficForDay,
} from "./traffic";

test("traffic interval labels cover the whole day in 15 minute steps", () => {
  assert.equal(formatTrafficTime(0), "00:00");
  assert.equal(formatTrafficTime(32), "08:00");
  assert.equal(formatTrafficTime(95), "23:45");
});

test("capacity-load labels use stable modelled-capacity bands", () => {
  assert.equal(describeCapacityLoad(null).label, "No estimate");
  assert.equal(describeCapacityLoad(20).label, "Low load");
  assert.equal(describeCapacityLoad(50).label, "Moderate load");
  assert.equal(describeCapacityLoad(70).label, "High load");
  assert.equal(describeCapacityLoad(90).label, "Near capacity");
  assert.equal(describeCapacityLoad(110).label, "Over modelled capacity");
});

test("weekday and weekend traffic profiles stay independent", () => {
  const road = {
    traffic_weekday_profile: [100],
    traffic_weekend_profile: [60],
    lanes_num: 2,
  };
  assert.deepEqual(trafficForDay(road, "weekday")?.volumeProfile, [100]);
  assert.deepEqual(trafficForDay(road, "weekend")?.volumeProfile, [60]);
  assert.equal(estimatedCapacityPerInterval(road), 450);
  assert.equal(estimatedCapacityLoad(road, 0, "weekday"), 22);
  assert.equal(estimatedCapacityLoad(road, 0, "weekend"), 13);
});
