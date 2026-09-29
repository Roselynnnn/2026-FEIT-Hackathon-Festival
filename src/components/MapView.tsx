import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Map as LibreMap, PointLike } from "maplibre-gl";
import {
  addLayers,
  syncRoadSelection,
  syncWorkRange,
  syncTrafficTime,
  syncVisibility,
} from "../map/layers";
import { TrafficTimeBar } from "./TrafficTimeBar";
import { WorkRangeControls } from "./WorkRangeControls";
import { RestrictionControls } from "./RestrictionControls";
import type { RoadSelection, RoadSelectionAction } from "../domain/selection";
import { snapToRoad } from "../domain/workRange";
import { formatTrafficTime, trafficDayLabel } from "../domain/traffic";
import type {
  LayerVisibility,
  MapData,
  RoadFeature,
  TrafficDayType,
  ViewMode,
} from "../types";

// Bundle the worker and its shared imports for both Vite dev and production.
maplibregl.setWorkerUrl(workerUrl);

interface Props {
  data: MapData | null;
  dataError: string | null;
  mode: ViewMode;
  layers: LayerVisibility;
  trafficTime: number;
  trafficDayType: TrafficDayType;
  onTrafficTimeChange: (value: number) => void;
  onTrafficDayTypeChange: (value: TrafficDayType) => void;
  selectedRoad: RoadFeature | null;
  selection: RoadSelection;
  onRangeAction: (action: RoadSelectionAction) => void;
  onRoadHover: (road: RoadFeature | null) => void;
  onRoadSelect: (road: RoadFeature) => void;
  onClearSelection: () => void;
  onRetryData: () => void;
}

export function MapView({
  data,
  dataError,
  mode,
  layers,
  trafficTime,
  trafficDayType,
  onTrafficTimeChange,
  onTrafficDayTypeChange,
  selectedRoad,
  selection,
  onRangeAction,
  onRoadHover,
  onRoadSelect,
  onClearSelection,
  onRetryData,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const settings = useRef({
    mode,
    layers,
    trafficTime,
    trafficDayType,
    selectedRoad,
    selection,
    onRangeAction,
    onRoadHover,
    onRoadSelect,
  });
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    settings.current = {
      mode,
      layers,
      trafficTime,
      trafficDayType,
      selectedRoad,
      selection,
      onRangeAction,
      onRoadHover,
      onRoadSelect,
    };
  }, [
    mode,
    layers,
    trafficTime,
    trafficDayType,
    selectedRoad,
    selection,
    onRangeAction,
    onRoadHover,
    onRoadSelect,
  ]);

  useEffect(() => {
    if (!data || !container.current) return;
    setReady(false);
    setMapError(null);
    let disposed = false;
    let map: LibreMap;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [data.manifest.centre.longitude, data.manifest.centre.latitude],
        zoom: 14.65,
        pitch: 0,
        bearing: 0,
        canvasContextAttributes: { antialias: true },
        maxPitch: 75,
      });
    } catch (error) {
      setMapError(
        error instanceof Error
          ? error.message
          : "Unable to initialise the map.",
      );
      return;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }),
      "bottom-right",
    );
    const markerElement = document.createElement("div");
    markerElement.className = "market-marker";
    markerElement.setAttribute("aria-label", "Queen Victoria Market");
    const marker = new maplibregl.Marker({
      element: markerElement,
      anchor: "bottom",
    })
      .setLngLat([
        data.manifest.centre.longitude,
        data.manifest.centre.latitude,
      ])
      .addTo(map);
    const timeout = window.setTimeout(() => {
      if (!disposed)
        setMapError(
          "The basemap is taking too long to load. Check your connection and retry.",
        );
    }, 30000);

    map.on("load", () => {
      if (disposed) return;
      window.clearTimeout(timeout);
      try {
        addLayers(map, data);
        syncVisibility(map, settings.current.mode, settings.current.layers);
        syncTrafficTime(
          map,
          settings.current.trafficTime,
          settings.current.trafficDayType,
        );
        syncRoadSelection(map, settings.current.selectedRoad);
        syncWorkRange(
          map,
          settings.current.selectedRoad,
          settings.current.selection.range,
        );
        setMapError(null);
        setReady(true);
      } catch (error) {
        setMapError(
          error instanceof Error ? error.message : "Unable to load map layers.",
        );
      }
    });
    map.on("error", (event) => {
      if (!disposed) setMapError(event.error.message);
    });

    // Resolve rendered tile fragments back to the original complete OSM feature.
    const roadsById = new Map(
      data.road_lanes.features.map((road) => [road.properties.osm_id, road]),
    );
    function roadAt(point: PointLike) {
      if (!map.getLayer("road-interaction") || !settings.current.layers.roads)
        return undefined;
      const feature = map.queryRenderedFeatures(point, {
        layers: ["road-interaction"],
      })[0];
      return feature ? roadsById.get(feature.properties.osm_id) : undefined;
    }
    map.on("click", (event) => {
      const current = settings.current;
      if (current.selectedRoad && current.selection.picking) {
        const point = snapToRoad(current.selectedRoad.geometry, [
          event.lngLat.lng,
          event.lngLat.lat,
        ]);
        const screen = map.project(point.coordinates);
        // A screen-space tolerance keeps snapping usable at any zoom or pitch,
        // without accepting clicks far away from the selected road.
        if (
          Math.hypot(screen.x - event.point.x, screen.y - event.point.y) <= 16
        ) {
          current.onRangeAction({ type: "place-endpoint", point });
        }
        return;
      }
      const road = roadAt(event.point);
      if (road) settings.current.onRoadSelect(road);
    });
    map.on("mousemove", (event) => {
      const road = roadAt(event.point);
      map.getCanvas().style.cursor = settings.current.selection.picking
        ? "crosshair"
        : road
          ? "pointer"
          : "";
      if (!settings.current.selectedRoad)
        settings.current.onRoadHover(road ?? null);
    });
    const clearHover = () => settings.current.onRoadHover(null);
    map.getCanvas().addEventListener("mouseleave", clearHover);
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      observer.disconnect();
      map.getCanvas().removeEventListener("mouseleave", clearHover);
      marker.remove();
      map.remove(); // Also removes its listeners, controls, canvas and workers.
      mapRef.current = null;
    };
  }, [data, attempt]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    syncRoadSelection(mapRef.current, selectedRoad);
  }, [ready, selectedRoad]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    syncWorkRange(mapRef.current, selectedRoad, selection.range);
    mapRef.current.getCanvas().style.cursor = selection.picking
      ? "crosshair"
      : "";
  }, [ready, selectedRoad, selection.range, selection.picking]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    syncVisibility(mapRef.current, mode, layers);
    if (!layers.roads) mapRef.current.getCanvas().style.cursor = "";
  }, [ready, mode, layers]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    syncTrafficTime(mapRef.current, trafficTime, trafficDayType);
  }, [ready, trafficTime, trafficDayType]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.easeTo(
      mode === "3d"
        ? { pitch: 58, bearing: -22, zoom: 15, duration: 900 }
        : { pitch: 0, bearing: 0, zoom: 14.65, duration: 900 },
    );
  }, [ready, mode]);

  const error = dataError || mapError;
  const retry = () =>
    dataError ? onRetryData() : setAttempt((value) => value + 1);
  return (
    <section className="map-shell">
      <div
        ref={container}
        id="map"
        className="map"
        aria-label="Interactive map of Queen Victoria Market and surrounding one kilometre"
      />
      <div className="map-overlay map-title">
        <b>1 km study area</b>
        <span id="viewLabel">
          {mode === "3d"
            ? "3D massing view • drag to rotate"
            : `${trafficDayLabel[trafficDayType]} capacity load at ${formatTrafficTime(trafficTime)} • hover or click a road`}
        </span>
      </div>
      {selectedRoad && (
        <div className="map-selection" aria-label="Selected road segment">
          <div className="map-selection-heading">
            <div>
              <strong>{selectedRoad.properties.name || "Selected road"}</strong>
              <span>Blue outline marks the selected segment</span>
            </div>
            <button type="button" onClick={onClearSelection}>
              Clear selection
            </button>
          </div>
          <WorkRangeControls selection={selection} onAction={onRangeAction} />
          <RestrictionControls selection={selection} onAction={onRangeAction} />
        </div>
      )}
      <div className="map-overlay traffic-legend">
        <span>
          <i style={{ background: "#2ca25f" }} />
          Low load
        </span>
        <span>
          <i style={{ background: "#f6d743" }} />
          Moderate load
        </span>
        <span>
          <i style={{ background: "#f28e2b" }} />
          High load
        </span>
        <span>
          <i style={{ background: "#d73027" }} />
          Near / over capacity
        </span>
        <span>
          <i style={{ background: "#87959b" }} />
          No estimate
        </span>
      </div>
      <TrafficTimeBar
        value={trafficTime}
        onChange={onTrafficTimeChange}
        dayType={trafficDayType}
        onDayTypeChange={onTrafficDayTypeChange}
      />
      {(!data || !ready) && (
        <div className="loading" role="status">
          {error ? (
            <div className="error">
              <b>Map could not be loaded</b>
              <p>{error}</p>
              <button onClick={retry}>Retry</button>
            </div>
          ) : (
            <div>
              <div className="loader" />
              <b>Loading Melbourne open data</b>
              <div className="caption">Buildings, roads and road details</div>
            </div>
          )}
        </div>
      )}
      {ready && error && (
        <div className="map-error" role="alert">
          Some map resources could not be loaded: {error}
          <button onClick={retry}>Retry</button>
        </div>
      )}
    </section>
  );
}
