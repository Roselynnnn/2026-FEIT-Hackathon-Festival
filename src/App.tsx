import { useEffect, useReducer, useState } from "react";
import type {
  LayerVisibility,
  MapData,
  TrafficDayType,
  ViewMode,
} from "./types";
import { loadMapData } from "./data/load";
import { Header } from "./components/Header";
import { LayerPanel } from "./components/LayerPanel";
import { RoadDetails } from "./components/RoadDetails";
import { MapView } from "./components/MapView";
import { emptyRoadSelection, roadSelectionReducer } from "./domain/selection";

export function App() {
  const [mode, setMode] = useState<ViewMode>("2d");
  const [layers, setLayers] = useState<LayerVisibility>({
    buildings: true,
    developments: true,
    roads: true,
  });
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, dispatchSelection] = useReducer(
    roadSelectionReducer,
    emptyRoadSelection,
  );
  const [trafficTime, setTrafficTime] = useState(32);
  const [trafficDayType, setTrafficDayType] =
    useState<TrafficDayType>("weekday");
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
          onRangeAction={dispatchSelection}
          onToggle={(id, enabled) =>
            setLayers((previous) => ({ ...previous, [id]: enabled }))
          }
        />
        <MapView
          data={data}
          dataError={error}
          mode={mode}
          layers={layers}
          trafficTime={trafficTime}
          trafficDayType={trafficDayType}
          onTrafficTimeChange={setTrafficTime}
          onTrafficDayTypeChange={setTrafficDayType}
          selectedRoad={selection.selected}
          selection={selection}
          onRangeAction={dispatchSelection}
          onRoadHover={(road) => dispatchSelection({ type: "hover", road })}
          onRoadSelect={(road) => dispatchSelection({ type: "select", road })}
          onClearSelection={() => dispatchSelection({ type: "clear" })}
          onRetryData={() => setAttempt((value) => value + 1)}
        />
        <RoadDetails
          road={(selection.selected ?? selection.hovered)?.properties ?? null}
          isSelected={selection.selected !== null}
          onClearSelection={() => dispatchSelection({ type: "clear" })}
          timeIndex={trafficTime}
          dayType={trafficDayType}
        />
      </main>
    </div>
  );
}
