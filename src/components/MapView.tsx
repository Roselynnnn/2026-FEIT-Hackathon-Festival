import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type {
  Map as LibreMap,
  MapGeoJSONFeature,
  PointLike,
} from "maplibre-gl";
import { addLayers, syncVisibility } from "../map/layers";
import type {
  LayerVisibility,
  MapData,
  RoadProperties,
  ViewMode,
} from "../types";

// Bundle the worker and its shared imports for both Vite dev and production.
maplibregl.setWorkerUrl(workerUrl);

interface Props {
  data: MapData | null;
  dataError: string | null;
  mode: ViewMode;
  layers: LayerVisibility;
  onRoadSelect: (road: RoadProperties) => void;
  onRetryData: () => void;
}

export function MapView({
  data,
  dataError,
  mode,
  layers,
  onRoadSelect,
  onRetryData,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const settings = useRef({ mode, layers, onRoadSelect });
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    settings.current = { mode, layers, onRoadSelect };
  }, [mode, layers, onRoadSelect]);

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

    let hoveredRoad = "";
    function roadAt(point: PointLike) {
      // Pointer events can arrive before the asynchronous style has loaded.
      if (!map.getLayer("road-interaction") || !settings.current.layers.roads)
        return undefined;
      return map.queryRenderedFeatures(point, {
        layers: ["road-interaction"],
      })[0];
    }
    function selectRoad(feature: MapGeoJSONFeature) {
      settings.current.onRoadSelect(feature.properties as RoadProperties);
    }
    map.on("click", (event) => {
      const road = roadAt(event.point);
      if (road) selectRoad(road);
    });
    map.on("mousemove", (event) => {
      const road = roadAt(event.point);
      map.getCanvas().style.cursor = road ? "pointer" : "";
      if (!road) {
        hoveredRoad = "";
        return;
      }
      const key = String(
        road.id ??
          road.properties.osm_id ??
          road.properties.way_id ??
          road.properties.name ??
          JSON.stringify(road.properties),
      );
      if (key !== hoveredRoad) {
        hoveredRoad = key;
        selectRoad(road);
      }
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      observer.disconnect();
      marker.remove();
      map.remove(); // Also removes its listeners, controls, canvas and workers.
      mapRef.current = null;
    };
  }, [data, attempt]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    syncVisibility(mapRef.current, mode, layers);
    if (!layers.roads) mapRef.current.getCanvas().style.cursor = "";
  }, [ready, mode, layers]);

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
            : "2D planning view • hover over or click a blue road"}
        </span>
      </div>
      <div className="map-overlay legend">
        <span>
          <i style={{ background: "#93a8b2" }} />
          Existing
        </span>
        <span>
          <i style={{ background: "#e78028" }} />
          Development
        </span>
        <span>
          <i style={{ height: 3, background: "#2c6eeb" }} />
          Road details
        </span>
        <span>
          <i style={{ background: "#ffd300", border: "1px solid #111" }} />
          Market
        </span>
        <span>
          <i
            style={{
              background: "transparent",
              border: "2px solid #2c6eeb",
              borderRadius: "50%",
            }}
          />
          1 km
        </span>
      </div>
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
