import type {
  RoadNetwork,
  NetworkSimulationResult,
  ImpactViewMode,
} from "../domain/networkSimulation";
import { simulateNetworkImpact } from "../domain/networkSimulation";
import type { RoadSelection } from "../domain/selection";
import { restrictionErrors } from "../domain/restrictions";
import type { TrafficDayType } from "../types";

function formatVehicleTime(minutes: number) {
  if (minutes < 60) return `${minutes.toLocaleString("en-AU")} veh-min`;
  return `${(minutes / 60).toLocaleString("en-AU", {
    maximumFractionDigits: 1,
  })} veh-hours`;
}

export function ImpactSimulation({
  network,
  selection,
  timeIndex,
  dayType,
  durationIntervals,
  result,
  viewMode,
  onResultChange,
  onViewModeChange,
}: {
  network: RoadNetwork;
  selection: RoadSelection;
  timeIndex: number;
  dayType: TrafficDayType;
  durationIntervals: number;
  result: NetworkSimulationResult | null;
  viewMode: ImpactViewMode;
  onResultChange: (result: NetworkSimulationResult | null) => void;
  onViewModeChange: (mode: ImpactViewMode) => void;
}) {
  const road = selection.selected?.properties;
  const errors = restrictionErrors(selection.restrictions, road);
  const canRun = Boolean(
    road?.osm_id != null &&
    selection.range.start &&
    selection.range.end &&
    durationIntervals > 0 &&
    !errors.laneError &&
    !errors.speedError,
  );
  function run() {
    if (!canRun || road?.osm_id == null) return;
    const next = simulateNetworkImpact(network, {
      selectedOsmId: road.osm_id,
      dayType,
      startIndex: timeIndex,
      durationIntervals,
      restrictions: selection.restrictions,
    });
    onResultChange(next);
    if (next) onViewModeChange("scenario");
  }

  return (
    <section
      className="impact-simulation"
      aria-label="Network impact simulation"
    >
      <div className="impact-heading">
        <div>
          <small>NETWORK IMPACT</small>
          <b>Local capacity-aware rerouting</b>
        </div>
        <button type="button" disabled={!canRun} onClick={run}>
          {result ? "Run again" : "Run simulation"}
        </button>
      </div>
      {!result && (
        <p className="impact-empty">
          Test how traffic exceeding the remaining work-zone capacity may shift
          onto nearby roads.
        </p>
      )}
      {result && (
        <>
          <div
            className="impact-view-tabs"
            role="group"
            aria-label="Impact map view"
          >
            {(["baseline", "scenario"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={viewMode === mode ? "active" : ""}
                aria-pressed={viewMode === mode}
                onClick={() => onViewModeChange(mode)}
              >
                {mode === "baseline"
                  ? "Without construction"
                  : "During construction"}
              </button>
            ))}
          </div>
          <div className="impact-metrics">
            <div>
              <small>Rerouted traffic</small>
              <b>{result.reroutedVehicles.toLocaleString("en-AU")}</b>
              <span>vehicles during works</span>
            </div>
            <div>
              <small>Additional delay</small>
              <b>{formatVehicleTime(result.totalAdditionalDelayMinutes)}</b>
              <span>network-wide estimate</span>
            </div>
            <div>
              <small>Impacted roads</small>
              <b>{result.impactedRoadCount}</b>
              <span>{result.newBottleneckCount} new bottlenecks</span>
            </div>
            <div>
              <small>Unresolved demand</small>
              <b>{result.unresolvedVehicles.toLocaleString("en-AU")}</b>
              <span>vehicles queued / unassigned</span>
            </div>
          </div>
          <div
            className={`impact-confidence ${result.confidence.toLowerCase()}`}
          >
            <b>{result.confidence} confidence</b>
            <span>
              SCATS observations where available; uncovered roads use explicit
              road-class assumptions.
            </span>
          </div>
          <details>
            <summary>How this estimate works</summary>
            <ul>
              {result.modelNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      {!canRun && (
        <p className="impact-warning">
          Complete the work range, restrictions and duration to run the
          simulation.
        </p>
      )}
    </section>
  );
}
