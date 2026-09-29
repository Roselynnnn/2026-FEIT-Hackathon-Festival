import type { Map, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type {
  MapData,
  LayerVisibility,
  TrafficDayType,
  ViewMode,
} from "../types";

export const layerGroups = {
  buildings: ["buildings-2d", "buildings-3d", "building-outline"],
  developments: ["developments-2d", "developments-3d", "development-outline"],
  roads: [
    "roads-fill",
    "roads-line",
    "road-traffic-casing",
    "road-interaction",
  ],
} as const;

const statusColors: ExpressionSpecification = [
  "match",
  ["upcase", ["coalesce", ["get", "status"], "UNKNOWN"]],
  "APPLIED",
  "#f0b93e",
  "APPROVED",
  "#8c66dc",
  "UNDER CONSTRUCTION",
  "#ed7441",
  "COMPLETED",
  "#43a67d",
  "COMPLETE",
  "#43a67d",
  "#e78028",
];

function trafficValue(
  timeIndex: number,
  dayType: TrafficDayType,
): ExpressionSpecification {
  const property =
    dayType === "weekend"
      ? "traffic_weekend_congestion_profile"
      : "traffic_congestion_profile";
  return [
    "case",
    ["has", property],
    ["at", timeIndex, ["array", "number", ["get", property]]],
    -1,
  ];
}

function trafficColor(
  timeIndex: number,
  dayType: TrafficDayType,
): ExpressionSpecification {
  const value = trafficValue(timeIndex, dayType);
  return [
    "case",
    ["<", value, 0],
    "#87959b",
    [
      "interpolate",
      ["linear"],
      value,
      0,
      "#2ca25f",
      35,
      "#a6d96a",
      55,
      "#f6d743",
      75,
      "#f28e2b",
      100,
      "#d73027",
    ],
  ];
}

function addSource(map: Map, name: string, data: FeatureCollection) {
  map.addSource(name, { type: "geojson", data });
}

export function addLayers(map: Map, data: MapData) {
  addSource(map, "study-area", data.study_area);
  addSource(map, "roads", data.roads);
  addSource(map, "road-lanes", data.road_lanes);
  addSource(map, "buildings", data.buildings);
  addSource(map, "developments", data.developments);
  map.addLayer({
    id: "roads-fill",
    type: "fill",
    source: "roads",
    paint: { "fill-color": "#7f8b91", "fill-opacity": 0.1 },
  });
  map.addLayer({
    id: "roads-line",
    type: "line",
    source: "roads",
    paint: { "line-color": "#7f8b91", "line-width": 0.7, "line-opacity": 0.25 },
  });
  map.addLayer({
    id: "buildings-2d",
    type: "fill",
    source: "buildings",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["get", "height"],
        2,
        "#cdd7da",
        20,
        "#91a7b1",
        80,
        "#5d7783",
        200,
        "#364e59",
      ],
      "fill-opacity": 0.78,
    },
  });
  map.addLayer({
    id: "building-outline",
    type: "line",
    source: "buildings",
    paint: {
      "line-color": "#52646d",
      "line-width": 0.35,
      "line-opacity": 0.55,
    },
  });
  map.addLayer({
    id: "developments-2d",
    type: "fill",
    source: "developments",
    paint: { "fill-color": statusColors, "fill-opacity": 0.78 },
  });
  map.addLayer({
    id: "development-outline",
    type: "line",
    source: "developments",
    paint: { "line-color": "#7f3d22", "line-width": 1, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "buildings",
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["get", "height"],
        2,
        "#cdd7da",
        20,
        "#91a7b1",
        80,
        "#5d7783",
        200,
        "#364e59",
      ],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.88,
    },
  });
  map.addLayer({
    id: "developments-3d",
    type: "fill-extrusion",
    source: "developments",
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": statusColors,
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "road-traffic-casing",
    type: "line",
    source: "road-lanes",
    paint: {
      "line-color": "#ffffff",
      "line-opacity": 0.82,
      "line-width": 5.5,
    },
  });
  map.addLayer({
    id: "road-interaction",
    type: "line",
    source: "road-lanes",
    paint: {
      "line-color": trafficColor(32, "weekday"),
      "line-opacity": 0.92,
      "line-width": 4,
    },
  });
  map.addLayer({
    id: "study-fill",
    type: "fill",
    source: "study-area",
    paint: { "fill-color": "#2c6eeb", "fill-opacity": 0.025 },
  });
  map.addLayer({
    id: "study-line",
    type: "line",
    source: "study-area",
    paint: {
      "line-color": "#2c6eeb",
      "line-width": 2,
      "line-dasharray": [3, 2],
    },
  });
}

export function syncTrafficTime(
  map: Map,
  timeIndex: number,
  dayType: TrafficDayType,
) {
  if (!map.getLayer("road-interaction")) return;
  map.setPaintProperty(
    "road-interaction",
    "line-color",
    trafficColor(timeIndex, dayType),
  );
}

export function syncVisibility(
  map: Map,
  mode: ViewMode,
  visible: LayerVisibility,
) {
  for (const [group, ids] of Object.entries(layerGroups)) {
    for (const id of ids) {
      if (!map.getLayer(id)) continue;
      const enabled =
        visible[group as keyof LayerVisibility] &&
        (!id.endsWith("-3d") || mode === "3d") &&
        (!id.endsWith("-2d") || mode === "2d");
      map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
    }
  }
}
