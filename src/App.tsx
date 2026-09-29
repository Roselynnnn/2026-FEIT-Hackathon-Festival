import { useEffect, useState } from "react";
import type {
  LayerVisibility,
  MapData,
  RoadProperties,
  ViewMode,
} from "./types";
import { loadMapData } from "./data/load";
import { Header } from "./components/Header";
import { LayerPanel } from "./components/LayerPanel";
import { RoadDetails } from "./components/RoadDetails";
import { MapView } from "./components/MapView";

export function App() {
  const [mode, setMode] = useState<ViewMode>("2d");
  const [layers, setLayers] = useState<LayerVisibility>({
    buildings: true,
    developments: true,
    roads: true,
  });
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [road, setRoad] = useState<RoadProperties | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    loadMapData(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="app">
      <Header mode={mode} onModeChange={setMode} />
      <main className="workspace">
        <LayerPanel
          data={data}
          layers={layers}
          onToggle={(id, enabled) =>
            setLayers((previous) => ({ ...previous, [id]: enabled }))
          }
        />
        <MapView
          data={data}
          dataError={error}
          mode={mode}
          layers={layers}
          onRoadSelect={setRoad}
          onRetryData={() => setAttempt((value) => value + 1)}
        />
        <RoadDetails road={road} />
      </main>
    </div>
  );
}
