import test from "node:test";
import assert from "node:assert/strict";
import type { AddressFeature, RoadFeature } from "../types";
import {
  matchEndpointAddress,
  matchRangeAddresses,
  parseAddress,
  planAddressRange,
} from "./addressRange";

const addresses: AddressFeature[] = [
  [140, 144.9626],
  [165, 144.9619],
  [200, 144.9607],
].map(([number, longitude]) => ({
  type: "Feature",
  properties: { street_address: `${number} Victoria Street CARLTON VIC 3053` },
  geometry: { type: "Point", coordinates: [longitude, -37.8062] },
}));

const roads: RoadFeature[] = [
  {
    type: "Feature",
    properties: {
      osm_id: 1,
      name: "Victoria Street",
      lanes_num: 2,
      oneway_mode: "two_way",
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [144.963, -37.806],
        [144.96, -37.806],
      ],
    },
  },
];

test("short address input accepts an omitted road suffix", () => {
  assert.deepEqual(parseAddress("160 Victoria"), {
    number: 160,
    streetKey: "victoria",
    streetLabel: "Victoria",
  });
});

test("two local addresses select and mark a range on the matching road", () => {
  const plan = planAddressRange(
    "160 Victoria Street",
    "170 Victoria Street",
    addresses,
    roads,
  );
  assert.equal(plan.road.properties.name, "Victoria Street");
  assert.equal(plan.road.properties.lanes_num, 2);
  assert.ok(plan.range.start);
  assert.ok(plan.range.end);
  assert.ok(Math.abs(plan.range.start.distance - plan.range.end.distance) > 10);
});

test("different streets and out-of-scope numbers report useful errors", () => {
  assert.throws(
    () => planAddressRange("160 Victoria", "170 Peel", addresses, roads),
    /same street/,
  );
  assert.throws(
    () => planAddressRange("20 Victoria", "30 Victoria", addresses, roads),
    /outside the available/,
  );
});

test("A and B endpoints match the nearest published addresses on the selected street", () => {
  const matches = matchRangeAddresses(
    {
      start: { coordinates: [144.96258, -37.80619], distance: 20 },
      end: { coordinates: [144.96072, -37.80618], distance: 180 },
    },
    roads[0],
    addresses,
  );
  assert.equal(matches.from?.label, "140 Victoria Street");
  assert.equal(matches.to?.label, "200 Victoria Street");
  assert.ok((matches.from?.distanceM ?? Infinity) < 5);
  assert.ok((matches.to?.distanceM ?? Infinity) < 5);
});

test("endpoint matching does not invent an address when none is close enough", () => {
  const match = matchEndpointAddress([145.1, -37.9], roads[0], addresses, 50);
  assert.equal(match, null);
});
