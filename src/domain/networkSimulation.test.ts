import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, LineString } from "geojson";
import type { RoadProperties } from "../types";
import { buildRoadNetwork, simulateNetworkImpact } from "./networkSimulation";
import type { TrafficRestrictions } from "./restrictions";

const profile = (volume: number) => Array.from({ length: 96 }, () => volume);

function road(
  osmId: number,
  name: string,
  coordinates: [number, number][],
  properties: Partial<RoadProperties> = {},
) {
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates },
    properties: {
      osm_id: osmId,
      name,
      highway: "residential",
      lanes_num: 2,
      oneway_mode: "two_way" as const,
      speed_limit_kmh: 40,
      ...properties,
    },
  };
}

function networkData(includeAlternative = true) {
  const features = [
    road(
      1,
      "Closed Street",
      [
        [144.95, -37.81],
        [144.96, -37.81],
      ],
      { traffic_weekday_profile: profile(100) },
    ),
  ];
  if (includeAlternative) {
    features.push(
      road(2, "North Detour", [
        [144.95, -37.81],
        [144.955, -37.805],
      ]),
      road(3, "East Detour", [
        [144.955, -37.805],
        [144.96, -37.81],
      ]),
    );
  }
  return {
    type: "FeatureCollection",
    features,
  } as FeatureCollection<LineString, RoadProperties>;
}

const fullClosure: TrafficRestrictions = {
  access: "closed",
  closedLanes: null,
  speedEnabled: false,
  speedKmh: null,
};

test("a full closure removes the selected edge and reroutes both directions", () => {
  const network = buildRoadNetwork(networkData());
  const result = simulateNetworkImpact(network, {
    selectedOsmId: 1,
    dayType: "weekday",
    startIndex: 32,
    durationIntervals: 4,
    restrictions: fullClosure,
  });
  assert.ok(result);
  assert.equal(result.reroutedVehicles, 400);
  assert.equal(result.unresolvedVehicles, 0);
  assert.equal(result.impactedRoadCount, 2);
  assert.ok(
    result.edgeImpacts.some(
      (impact) => impact.affected && impact.scenarioVolume === 0,
    ),
  );
  assert.ok(
    result.edgeImpacts.some(
      (impact) => impact.detour && impact.volumeDelta > 0,
    ),
  );
});

test("demand that cannot reach an alternative route is reported, not lost", () => {
  const network = buildRoadNetwork(networkData(false));
  const result = simulateNetworkImpact(network, {
    selectedOsmId: 1,
    dayType: "weekday",
    startIndex: 32,
    durationIntervals: 1,
    restrictions: fullClosure,
  });
  assert.ok(result);
  assert.equal(result.reroutedVehicles, 0);
  assert.equal(result.unresolvedVehicles, 100);
});

test("a lane closure only diverts demand above the remaining capacity", () => {
  const data = networkData();
  data.features[0].properties.traffic_weekday_profile = profile(500);
  const network = buildRoadNetwork(data);
  const result = simulateNetworkImpact(network, {
    selectedOsmId: 1,
    dayType: "weekday",
    startIndex: 32,
    durationIntervals: 1,
    restrictions: {
      access: "partial",
      closedLanes: 1,
      speedEnabled: false,
      speedKmh: null,
    },
  });
  assert.ok(result);
  assert.ok(result.reroutedVehicles > 0);
  assert.ok(result.reroutedVehicles < 500);
});

test("one-way roads never create a reverse graph edge", () => {
  const data = networkData(false);
  data.features[0].properties.oneway_mode = "forward";
  const network = buildRoadNetwork(data);
  assert.equal(network.bySource.get(1)?.length, 1);
  assert.ok(network.bySource.get(1)?.[0].id.endsWith(":f"));
});
