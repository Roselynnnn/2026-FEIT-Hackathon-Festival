import type { FeatureCollection, LineString } from "geojson";
import type { RoadProperties, TrafficDayType } from "../types";
import type { TrafficRestrictions } from "./restrictions";
import {
  ESTIMATED_CAPACITY_PER_LANE_INTERVAL,
  TRAFFIC_INTERVALS_PER_DAY,
  trafficForDay,
} from "./traffic";

type Coordinate = [number, number];

export interface NetworkEdge {
  id: string;
  sourceOsmId: number;
  from: string;
  to: string;
  coordinates: [Coordinate, Coordinate];
  roadName: string;
  highway: string;
  lengthM: number;
  lanes: number;
  speedKmh: number;
  capacity: number;
  properties: RoadProperties;
  directionShare: number;
  observedTraffic: boolean;
}

export interface RoadNetwork {
  edges: NetworkEdge[];
  adjacency: Map<string, NetworkEdge[]>;
  incoming: Map<string, NetworkEdge[]>;
  bySource: Map<number, NetworkEdge[]>;
}

export type ImpactViewMode = "baseline" | "scenario" | "difference";

export interface EdgeImpact {
  edgeId: string;
  sourceOsmId: number;
  roadName: string;
  coordinates: [Coordinate, Coordinate];
  baselineVolume: number;
  scenarioVolume: number;
  volumeDelta: number;
  baselineLoad: number;
  scenarioLoad: number;
  baselineTravelSeconds: number;
  scenarioTravelSeconds: number;
  affected: boolean;
  detour: boolean;
  observedTraffic: boolean;
}

export interface NetworkSimulationResult {
  edgeImpacts: EdgeImpact[];
  reroutedVehicles: number;
  unresolvedVehicles: number;
  totalAdditionalDelayMinutes: number;
  averageDetourMinutes: number;
  impactedRoadCount: number;
  newBottleneckCount: number;
  confidence: "High" | "Medium" | "Low";
  modelNotes: string[];
}

export interface NetworkSimulationInput {
  selectedOsmId: number;
  dayType: TrafficDayType;
  startIndex: number;
  durationIntervals: number;
  restrictions: TrafficRestrictions;
}

interface Route {
  edges: NetworkEdge[];
  costSeconds: number;
}

interface EdgeAccumulator {
  edge: NetworkEdge;
  baseline: number;
  scenario: number;
  baselineTravel: number;
  scenarioTravel: number;
  weight: number;
  affected: boolean;
  detour: boolean;
}

const radians = Math.PI / 180;

function distanceMetres(a: Coordinate, b: Coordinate) {
  const lat = Math.sin(((b[1] - a[1]) * radians) / 2);
  const lon = Math.sin(((b[0] - a[0]) * radians) / 2);
  const h =
    lat * lat + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * lon * lon;
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function nodeKey(coordinate: Coordinate) {
  return `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`;
}

function defaultLaneCount(highway: string) {
  if (["motorway", "trunk", "primary"].includes(highway)) return 2;
  return 1;
}

function defaultSpeed(highway: string) {
  if (["motorway", "trunk"].includes(highway)) return 60;
  if (["service", "living_street"].includes(highway)) return 30;
  return 50;
}

function isVehicleRoad(highway: string) {
  return ![
    "cycleway",
    "footway",
    "path",
    "pedestrian",
    "steps",
    "construction",
    "proposed",
  ].includes(highway);
}

function roadPenalty(highway: string) {
  if (["service", "living_street"].includes(highway)) return 2.4;
  if (["residential", "unclassified"].includes(highway)) return 1.35;
  return 1;
}

function inferredLoadRatio(highway: string) {
  if (["motorway", "trunk", "primary"].includes(highway)) return 0.42;
  if (highway === "secondary") return 0.32;
  if (highway === "tertiary") return 0.25;
  if (["service", "living_street"].includes(highway)) return 0.08;
  return 0.18;
}

function addEdge(network: RoadNetwork, edge: NetworkEdge) {
  network.edges.push(edge);
  const outgoing = network.adjacency.get(edge.from) ?? [];
  outgoing.push(edge);
  network.adjacency.set(edge.from, outgoing);
  const incoming = network.incoming.get(edge.to) ?? [];
  incoming.push(edge);
  network.incoming.set(edge.to, incoming);
  const sourceEdges = network.bySource.get(edge.sourceOsmId) ?? [];
  sourceEdges.push(edge);
  network.bySource.set(edge.sourceOsmId, sourceEdges);
}

export function buildRoadNetwork(
  roads: FeatureCollection<LineString, RoadProperties>,
): RoadNetwork {
  const network: RoadNetwork = {
    edges: [],
    adjacency: new Map(),
    incoming: new Map(),
    bySource: new Map(),
  };
  roads.features.forEach((feature, featureIndex) => {
    const osmId = feature.properties.osm_id;
    const highway = feature.properties.highway ?? "unclassified";
    if (osmId == null || !isVehicleRoad(highway)) return;
    const coordinates = feature.geometry.coordinates as Coordinate[];
    if (coordinates.length < 2) return;
    const totalLanes =
      Number.isFinite(feature.properties.lanes_num) &&
      (feature.properties.lanes_num ?? 0) > 0
        ? feature.properties.lanes_num!
        : defaultLaneCount(highway);
    const oneWay =
      feature.properties.oneway_mode === "forward" ||
      feature.properties.oneway_mode === "reverse";
    const directionShare = oneWay ? 1 : 0.5;
    const directionLanes = Math.max(0.5, totalLanes * directionShare);
    const speedKmh =
      feature.properties.speed_limit_kmh ?? defaultSpeed(highway);
    const capacity = directionLanes * ESTIMATED_CAPACITY_PER_LANE_INTERVAL;
    const observedTraffic = Boolean(
      feature.properties.traffic_weekday_profile?.length ===
        TRAFFIC_INTERVALS_PER_DAY ||
      feature.properties.traffic_weekend_profile?.length ===
        TRAFFIC_INTERVALS_PER_DAY,
    );
    const common = {
      sourceOsmId: osmId,
      roadName: feature.properties.name ?? `Road ${osmId}`,
      highway,
      lanes: directionLanes,
      speedKmh,
      capacity,
      properties: feature.properties,
      directionShare,
      observedTraffic,
    };
    for (let segment = 1; segment < coordinates.length; segment++) {
      const start = coordinates[segment - 1];
      const end = coordinates[segment];
      const lengthM = distanceMetres(start, end);
      if (lengthM < 0.2) continue;
      if (feature.properties.oneway_mode !== "reverse") {
        addEdge(network, {
          ...common,
          id: `${osmId}:${featureIndex}:${segment - 1}:f`,
          from: nodeKey(start),
          to: nodeKey(end),
          coordinates: [start, end],
          lengthM,
        });
      }
      if (feature.properties.oneway_mode !== "forward") {
        addEdge(network, {
          ...common,
          id: `${osmId}:${featureIndex}:${segment - 1}:r`,
          from: nodeKey(end),
          to: nodeKey(start),
          coordinates: [end, start],
          lengthM,
        });
      }
    }
  });
  return network;
}

function baselineVolume(
  edge: NetworkEdge,
  timeIndex: number,
  dayType: TrafficDayType,
) {
  const observed = trafficForDay(edge.properties, dayType)?.volumeProfile?.[
    timeIndex
  ];
  if (Number.isFinite(observed))
    return Math.max(0, observed! * edge.directionShare);
  return edge.capacity * inferredLoadRatio(edge.highway);
}

function travelSeconds(
  edge: NetworkEdge,
  volume: number,
  capacity = edge.capacity,
) {
  if (capacity <= 0) return Number.POSITIVE_INFINITY;
  const freeFlow = (edge.lengthM / edge.speedKmh) * 3.6;
  const ratio = Math.min(2.5, Math.max(0, volume / capacity));
  return freeFlow * (1 + 0.15 * ratio ** 4);
}

function shortestPath(
  network: RoadNetwork,
  start: string,
  end: string,
  excludedSource: number,
  timeIndex: number,
  dayType: TrafficDayType,
  penalties: Map<string, number>,
): Route | null {
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, NetworkEdge>();
  const queue: Array<[string, number]> = [[start, 0]];
  while (queue.length) {
    queue.sort((a, b) => a[1] - b[1]);
    const [node, distance] = queue.shift()!;
    if (distance !== distances.get(node)) continue;
    if (node === end) break;
    for (const edge of network.adjacency.get(node) ?? []) {
      if (edge.sourceOsmId === excludedSource) continue;
      const volume = baselineVolume(edge, timeIndex, dayType);
      const cost =
        travelSeconds(edge, volume) *
        roadPenalty(edge.highway) *
        (penalties.get(edge.id) ?? 1);
      const next = distance + cost;
      if (next >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY))
        continue;
      distances.set(edge.to, next);
      previous.set(edge.to, edge);
      queue.push([edge.to, next]);
    }
  }
  if (!previous.has(end)) return null;
  const edges: NetworkEdge[] = [];
  let node = end;
  while (node !== start) {
    const edge = previous.get(node);
    if (!edge) return null;
    edges.push(edge);
    node = edge.from;
  }
  edges.reverse();
  return { edges, costSeconds: distances.get(end)! };
}

function alternativeRoutes(
  network: RoadNetwork,
  start: string,
  end: string,
  excludedSource: number,
  timeIndex: number,
  dayType: TrafficDayType,
  limit = 3,
) {
  const routes: Route[] = [];
  const penalties = new Map<string, number>();
  const signatures = new Set<string>();
  for (
    let attempt = 0;
    attempt < limit * 3 && routes.length < limit;
    attempt++
  ) {
    const route = shortestPath(
      network,
      start,
      end,
      excludedSource,
      timeIndex,
      dayType,
      penalties,
    );
    if (!route) break;
    const signature = route.edges.map((edge) => edge.id).join("|");
    if (!signatures.has(signature)) {
      signatures.add(signature);
      routes.push(route);
    }
    for (const edge of route.edges)
      penalties.set(edge.id, (penalties.get(edge.id) ?? 1) * 2.2);
  }
  return routes;
}

function routeCapacityFactor(
  route: Route,
  timeIndex: number,
  dayType: TrafficDayType,
) {
  const worstLoad = Math.max(
    ...route.edges.map(
      (edge) => baselineVolume(edge, timeIndex, dayType) / edge.capacity,
    ),
  );
  // Capacity is a soft constraint: saturated roads remain usable, but receive
  // a sharply lower share and subsequently accumulate BPR delay.
  return 1 / (1 + Math.max(0, worstLoad) ** 4);
}

function allocateToRoutes(
  routes: Route[],
  demand: number,
  timeIndex: number,
  dayType: TrafficDayType,
) {
  const allocations = new Map<Route, number>();
  if (!routes.length) return { allocations, unresolved: demand };
  const weights = routes.map(
    (route) =>
      routeCapacityFactor(route, timeIndex, dayType) /
      Math.max(1, route.costSeconds),
  );
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (weightTotal <= 0) return { allocations, unresolved: demand };
  routes.forEach((route, index) =>
    allocations.set(route, demand * (weights[index] / weightTotal)),
  );
  return { allocations, unresolved: 0 };
}

function restrictionCapacity(
  baseCapacity: number,
  totalLanes: number,
  restrictions: TrafficRestrictions,
) {
  if (restrictions.access === "closed") return 0;
  if (restrictions.access === "partial") {
    const remaining = Math.max(0, totalLanes - (restrictions.closedLanes ?? 0));
    return baseCapacity * (remaining / totalLanes);
  }
  return baseCapacity;
}

function timeWeights(startIndex: number, durationIntervals: number) {
  const weights = new Map<number, number>();
  for (let offset = 0; offset < durationIntervals; offset++) {
    const index = (startIndex + offset) % TRAFFIC_INTERVALS_PER_DAY;
    weights.set(index, (weights.get(index) ?? 0) + 1);
  }
  return weights;
}

function directionalBoundaries(edges: NetworkEdge[]) {
  const pairs: Array<[string, string, NetworkEdge]> = [];
  for (const direction of [":f", ":r"]) {
    const directional = edges.filter((edge) => edge.id.endsWith(direction));
    const starts = directional.filter(
      (edge) =>
        !directional.some(
          (candidate) => candidate.to === edge.from && candidate.id !== edge.id,
        ),
    );
    for (const startEdge of starts) {
      let current = startEdge;
      const visited = new Set<string>();
      while (!visited.has(current.id)) {
        visited.add(current.id);
        const next = directional.find(
          (edge) => edge.from === current.to && !visited.has(edge.id),
        );
        if (!next) break;
        current = next;
      }
      pairs.push([startEdge.from, current.to, startEdge]);
    }
  }
  // In unusual closed or duplicated geometries, retain at least one pair.
  if (!pairs.length && edges[0])
    pairs.push([edges[0].from, edges[0].to, edges[0]]);
  return pairs;
}

function expandDetourBoundaries(
  network: RoadNetwork,
  start: string,
  end: string,
  roadName: string,
  excludedSource: number,
) {
  let origin = start;
  const originVisited = new Set<string>();
  for (let step = 0; step < 24 && !originVisited.has(origin); step++) {
    originVisited.add(origin);
    const hasTurn = (network.adjacency.get(origin) ?? []).some(
      (edge) =>
        edge.sourceOsmId !== excludedSource && edge.roadName !== roadName,
    );
    if (hasTurn) break;
    const previous = (network.incoming.get(origin) ?? []).find(
      (edge) =>
        edge.sourceOsmId !== excludedSource && edge.roadName === roadName,
    );
    if (!previous) break;
    origin = previous.from;
  }

  let destination = end;
  const destinationVisited = new Set<string>();
  for (
    let step = 0;
    step < 24 && !destinationVisited.has(destination);
    step++
  ) {
    destinationVisited.add(destination);
    const hasTurnIn = (network.incoming.get(destination) ?? []).some(
      (edge) =>
        edge.sourceOsmId !== excludedSource && edge.roadName !== roadName,
    );
    if (hasTurnIn) break;
    const next = (network.adjacency.get(destination) ?? []).find(
      (edge) =>
        edge.sourceOsmId !== excludedSource && edge.roadName === roadName,
    );
    if (!next) break;
    destination = next.to;
  }
  return [origin, destination] as const;
}

export function simulateNetworkImpact(
  network: RoadNetwork,
  input: NetworkSimulationInput,
): NetworkSimulationResult | null {
  const affectedEdges = network.bySource.get(input.selectedOsmId);
  if (!affectedEdges?.length || input.durationIntervals < 1) return null;
  const affectedProperties = affectedEdges[0].properties;
  const totalLanes = Math.max(1, affectedProperties.lanes_num ?? 1);
  const weights = timeWeights(input.startIndex, input.durationIntervals);
  const accumulators = new Map<string, EdgeAccumulator>();
  let reroutedVehicles = 0;
  let unresolvedVehicles = 0;
  let totalDelayMinutes = 0;
  let routeEdgeSamples = 0;
  let observedRouteEdgeSamples = 0;

  function accumulate(
    edge: NetworkEdge,
    baseline: number,
    scenario: number,
    baselineTime: number,
    scenarioTime: number,
    weight: number,
    affected: boolean,
    detour: boolean,
  ) {
    const current = accumulators.get(edge.id) ?? {
      edge,
      baseline: 0,
      scenario: 0,
      baselineTravel: 0,
      scenarioTravel: 0,
      weight: 0,
      affected: false,
      detour: false,
    };
    current.baseline += baseline * weight;
    current.scenario += scenario * weight;
    current.baselineTravel += baselineTime * weight;
    current.scenarioTravel += scenarioTime * weight;
    current.weight += weight;
    current.affected ||= affected;
    current.detour ||= detour;
    accumulators.set(edge.id, current);
  }

  for (const [timeIndex, weight] of weights) {
    const scenarioVolumes = new Map<string, number>();
    const routeEdges = new Set<NetworkEdge>();
    for (const [start, end, representative] of directionalBoundaries(
      affectedEdges,
    )) {
      const [routeStart, routeEnd] = expandDetourBoundaries(
        network,
        start,
        end,
        representative.roadName,
        input.selectedOsmId,
      );
      const baseline = baselineVolume(representative, timeIndex, input.dayType);
      const baseCapacity = representative.capacity;
      const newCapacity = restrictionCapacity(
        baseCapacity,
        totalLanes,
        input.restrictions,
      );
      const retained = Math.min(baseline, newCapacity);
      const diverted = Math.max(0, baseline - retained);
      scenarioVolumes.set(representative.id, retained);
      if (diverted <= 0.01) continue;
      const routes = alternativeRoutes(
        network,
        routeStart,
        routeEnd,
        input.selectedOsmId,
        timeIndex,
        input.dayType,
      );
      const allocation = allocateToRoutes(
        routes,
        diverted,
        timeIndex,
        input.dayType,
      );
      reroutedVehicles += (diverted - allocation.unresolved) * weight;
      unresolvedVehicles += allocation.unresolved * weight;
      for (const [route, assigned] of allocation.allocations) {
        for (const edge of route.edges) {
          routeEdges.add(edge);
          scenarioVolumes.set(
            edge.id,
            (scenarioVolumes.get(edge.id) ??
              baselineVolume(edge, timeIndex, input.dayType)) + assigned,
          );
        }
      }
    }

    for (const edge of affectedEdges) {
      const baseline = baselineVolume(edge, timeIndex, input.dayType);
      const newCapacity = restrictionCapacity(
        edge.capacity,
        totalLanes,
        input.restrictions,
      );
      const scenario = Math.min(baseline, newCapacity);
      const baselineTime = travelSeconds(edge, baseline);
      const scenarioSpeed =
        input.restrictions.speedEnabled && input.restrictions.speedKmh
          ? Math.min(edge.speedKmh, input.restrictions.speedKmh)
          : edge.speedKmh;
      const speedAdjusted = { ...edge, speedKmh: scenarioSpeed };
      const scenarioTime =
        newCapacity > 0
          ? travelSeconds(speedAdjusted, scenario, newCapacity)
          : 0;
      totalDelayMinutes +=
        ((scenario * scenarioTime - baseline * baselineTime) * weight) / 60;
      accumulate(
        edge,
        baseline,
        scenario,
        baselineTime,
        scenarioTime,
        weight,
        true,
        false,
      );
    }

    for (const edge of routeEdges) {
      const baseline = baselineVolume(edge, timeIndex, input.dayType);
      const scenario = scenarioVolumes.get(edge.id) ?? baseline;
      const baselineTime = travelSeconds(edge, baseline);
      const scenarioTime = travelSeconds(edge, scenario);
      totalDelayMinutes +=
        ((scenario * scenarioTime - baseline * baselineTime) * weight) / 60;
      routeEdgeSamples += weight;
      if (edge.observedTraffic) observedRouteEdgeSamples += weight;
      accumulate(
        edge,
        baseline,
        scenario,
        baselineTime,
        scenarioTime,
        weight,
        false,
        true,
      );
    }
  }

  const edgeImpacts = Array.from(accumulators.values()).map((item) => {
    const baseline = item.baseline / item.weight;
    const scenario = item.scenario / item.weight;
    return {
      edgeId: item.edge.id,
      sourceOsmId: item.edge.sourceOsmId,
      roadName: item.edge.roadName,
      coordinates: item.edge.coordinates,
      baselineVolume: baseline,
      scenarioVolume: scenario,
      volumeDelta: scenario - baseline,
      baselineLoad: (baseline / item.edge.capacity) * 100,
      scenarioLoad: (scenario / item.edge.capacity) * 100,
      baselineTravelSeconds: item.baselineTravel / item.weight,
      scenarioTravelSeconds: item.scenarioTravel / item.weight,
      affected: item.affected,
      detour: item.detour,
      observedTraffic: item.edge.observedTraffic,
    };
  });
  const impactedRoadCount = new Set(
    edgeImpacts
      .filter((impact) => impact.detour && impact.volumeDelta >= 1)
      .map((impact) => impact.sourceOsmId),
  ).size;
  const newBottleneckCount = new Set(
    edgeImpacts
      .filter(
        (impact) =>
          impact.detour &&
          impact.baselineLoad < 100 &&
          impact.scenarioLoad >= 100,
      )
      .map((impact) => impact.sourceOsmId),
  ).size;
  const resolvedVehicles = reroutedVehicles;
  const confidence = !affectedEdges[0].observedTraffic
    ? "Low"
    : routeEdgeSamples > 0 && observedRouteEdgeSamples / routeEdgeSamples >= 0.7
      ? "High"
      : "Medium";
  return {
    edgeImpacts,
    reroutedVehicles: Math.round(reroutedVehicles),
    unresolvedVehicles: Math.round(unresolvedVehicles),
    totalAdditionalDelayMinutes: Math.round(Math.max(0, totalDelayMinutes)),
    averageDetourMinutes:
      resolvedVehicles > 0
        ? Math.round((Math.max(0, totalDelayMinutes) / resolvedVehicles) * 10) /
          10
        : 0,
    impactedRoadCount,
    newBottleneckCount,
    confidence,
    modelNotes: [
      "Capacity-aware assignment across up to three local alternative routes.",
      "Observed SCATS profiles are used where available; uncovered roads use explicit road-class load assumptions.",
      "Results are a planning-screening estimate, not a traffic-management approval or microscopic simulation.",
    ],
  };
}
