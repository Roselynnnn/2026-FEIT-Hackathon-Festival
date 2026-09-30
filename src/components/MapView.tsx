import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Map as LibreMap, PointLike } from "maplibre-gl";
import {
  addLayers,
  syncRoadSelection,
  syncWorkRange,
  syncTrafficTime,
  syncVisibility,
  syncSimulationImpact,
} from "../map/layers";
import { TrafficTimeBar } from "./TrafficTimeBar";
import { WorkRangeControls } from "./WorkRangeControls";
import { RestrictionControls } from "./RestrictionControls";
import { TimingAssessment } from "./TimingAssessment";
import { AddressRangeSelector } from "./AddressRangeSelector";
import { ImpactSimulation } from "./ImpactSimulation";
import type { RoadSelection, RoadSelectionAction } from "../domain/selection";
import { snapToRoad } from "../domain/workRange";
import { buildStraightRoadSection } from "../domain/corridor";
import { formatTrafficTime, trafficDayLabel } from "../domain/traffic";
import {
  buildRoadNetwork,
  type ImpactViewMode,
  type NetworkSimulationResult,
} from "../domain/networkSimulation";
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
  planningWorkZone: boolean;
  onStartWorkZone: () => void;
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
  planningWorkZone,
  onStartWorkZone,
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
    planningWorkZone,
  });
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [guideMinimized, setGuideMinimized] = useState(false);
  const [addressEntryOpen, setAddressEntryOpen] = useState(false);
  const [durationIntervals, setDurationIntervals] = useState(4);
  const [simulationResult, setSimulationResult] =
    useState<NetworkSimulationResult | null>(null);
  const [impactViewMode, setImpactViewMode] =
    useState<ImpactViewMode>("baseline");
  const roadNetwork = useMemo(
    () => (data ? buildRoadNetwork(data.road_lanes) : null),
    [data],
  );

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
      planningWorkZone,
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
    planningWorkZone,
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
    const roadFeatures = data.road_lanes.features;
    const roadsById = new Map(
      roadFeatures.map((road) => [road.properties.osm_id, road]),
    );
    const sectionsById = new Map<number | undefined, RoadFeature>();
    function roadAt(point: PointLike) {
      if (!map.getLayer("road-interaction") || !settings.current.layers.roads)
        return undefined;
      const feature = map.queryRenderedFeatures(point, {
        layers: ["road-interaction"],
      })[0];
      const road = feature
        ? roadsById.get(feature.properties.osm_id)
        : undefined;
      if (!road) return undefined;
      const cached = sectionsById.get(road.properties.osm_id);
      if (cached) return cached;
      const section = buildStraightRoadSection(road, roadFeatures);
      sectionsById.set(road.properties.osm_id, section);
      return section;
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
        : settings.current.planningWorkZone &&
            !settings.current.selectedRoad &&
            road
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
    const { start, end } = selection.range;
    if (!ready || !mapRef.current || !start || !end) return;
    const bounds = new maplibregl.LngLatBounds()
      .extend(start.coordinates)
      .extend(end.coordinates);
    mapRef.current.fitBounds(bounds, {
      padding: { top: 110, right: 60, bottom: 150, left: 390 },
      maxZoom: 17,
      duration: 700,
    });
  }, [ready, selection.range.start, selection.range.end]);

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
    syncSimulationImpact(mapRef.current, simulationResult, impactViewMode);
  }, [ready, simulationResult, impactViewMode]);

  useEffect(() => {
    setSimulationResult(null);
    setImpactViewMode("baseline");
  }, [
    selectedRoad?.properties.osm_id,
    selection.range.start?.distance,
    selection.range.end?.distance,
    selection.restrictions.access,
    selection.restrictions.closedLanes,
    selection.restrictions.speedEnabled,
    selection.restrictions.speedKmh,
    trafficTime,
    trafficDayType,
    durationIntervals,
  ]);

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
        <b>Queen Victoria Market work-zone planner</b>
        <span id="viewLabel">
          {mode === "3d"
            ? "3D massing view • drag to rotate"
            : `${trafficDayLabel[trafficDayType]} capacity load at ${formatTrafficTime(trafficTime)} • hover or click a road`}
        </span>
      </div>
      {!selectedRoad && !planningWorkZone && ready && (
        <button
          type="button"
          className="work-zone-entry"
          onClick={() => {
            setGuideMinimized(false);
            onStartWorkZone();
          }}
        >
          <span className="work-zone-entry-icon" aria-hidden="true">
            <i />
          </span>
          <span className="work-zone-entry-copy">
            <strong>Plan a work zone</strong>
            <small>Test a temporary closure before it goes on site</small>
          </span>
          <span className="work-zone-entry-arrow" aria-hidden="true">
            →
          </span>
        </button>
      )}
      {!selectedRoad && planningWorkZone && ready && (
        <div className="work-zone-minimized work-zone-ready" role="status">
          <span>WORK ZONE SETUP</span>
          <b>
            <i aria-hidden="true" />
            Click a road to begin
          </b>
        </div>
      )}
      {selectedRoad && (!planningWorkZone || !guideMinimized) && (
        <div className="map-selection" aria-label="Selected road segment">
          {planningWorkZone && (
            <div className="work-zone-progress" role="status">
              <span>WORK ZONE SETUP</span>
              <button
                type="button"
                className="guide-minimise"
                aria-label="Minimise work zone setup"
                title="Minimise"
                onClick={() => setGuideMinimized(true)}
              >
                −
              </button>
            </div>
          )}
          <div className="map-selection-heading">
            <div>
              <strong>{selectedRoad.properties.name || "Selected road"}</strong>
              <span>
                Blue outline follows the straight section ·{" "}
                {selectedRoad.properties.selection_segment_count ?? 1} mapped
                segment
                {selectedRoad.properties.selection_segment_count === 1
                  ? ""
                  : "s"}
              </span>
            </div>
            <button type="button" onClick={onClearSelection}>
              Clear selection
            </button>
          </div>
          <WorkRangeControls selection={selection} onAction={onRangeAction} />
          {planningWorkZone && (
            <div className="work-range-address">
              <div className="work-range-address-heading">
                <div>
                  <b>
                    Exact address range <span>Optional</span>
                  </b>
                  <small>
                    Your map-selected A / B range is already ready to use.
                  </small>
                </div>
                <button
                  type="button"
                  aria-expanded={addressEntryOpen}
                  onClick={() => setAddressEntryOpen((open) => !open)}
                >
                  {addressEntryOpen ? "Hide addresses" : "Enter addresses"}
                </button>
              </div>
              {addressEntryOpen && (
                <AddressRangeSelector
                  compact
                  data={data}
                  onSelect={(road, range) =>
                    onRangeAction({ type: "select-range", road, range })
                  }
                />
              )}
            </div>
          )}
          <RestrictionControls selection={selection} onAction={onRangeAction} />
          <TimingAssessment
            selection={selection}
            timeIndex={trafficTime}
            dayType={trafficDayType}
            onTimeChange={onTrafficTimeChange}
            onDayTypeChange={onTrafficDayTypeChange}
            onDurationIntervalsChange={setDurationIntervals}
          />
          {planningWorkZone && roadNetwork && (
            <ImpactSimulation
              network={roadNetwork}
              selection={selection}
              timeIndex={trafficTime}
              dayType={trafficDayType}
              durationIntervals={durationIntervals}
              result={simulationResult}
              viewMode={impactViewMode}
              onResultChange={setSimulationResult}
              onViewModeChange={setImpactViewMode}
            />
          )}
        </div>
      )}
      {selectedRoad && planningWorkZone && guideMinimized && ready && (
        <button
          type="button"
          className="work-zone-minimized"
          aria-label="Expand work zone setup"
          onClick={() => setGuideMinimized(false)}
        >
          <span>WORK ZONE SETUP</span>
          <b>+</b>
        </button>
      )}
      <div className="map-overlay traffic-legend">
        {simulationResult && impactViewMode === "difference" ? (
          <>
            <span>
              <i style={{ background: "#8835ba" }} />
              Work zone
            </span>
            <span>
              <i style={{ background: "#268bd2" }} />
              Detour
            </span>
            <span>
              <i style={{ background: "#f28e2b" }} />
              High increase
            </span>
            <span>
              <i style={{ background: "#d73027" }} />
              New bottleneck
            </span>
          </>
        ) : (
          <>
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
          </>
        )}
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
