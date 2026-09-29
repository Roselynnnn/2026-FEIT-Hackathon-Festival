import type { RoadSelection, RoadSelectionAction } from "../domain/selection";
import {
  mappedLaneCount,
  mappedSpeedLimit,
  restrictionErrors,
  restrictionSummary,
  type AccessMode,
} from "../domain/restrictions";
import { rangeLength } from "../domain/workRange";

export function RestrictionControls({
  selection,
  onAction,
}: {
  selection: RoadSelection;
  onAction: (action: RoadSelectionAction) => void;
}) {
  const length = rangeLength(selection.range);
  const road = selection.selected?.properties;
  const restrictions = selection.restrictions;
  const lanes = mappedLaneCount(road);
  const speed = mappedSpeedLimit(road);
  const { laneError, speedError } = restrictionErrors(restrictions, road);
  const summary = restrictionSummary(restrictions, road);
  return (
    <section className="restriction-controls" aria-label="Traffic restrictions">
      <b>Traffic restrictions</b>
      {length === null && (
        <p className="caption">Set the work range to configure restrictions.</p>
      )}
      <fieldset disabled={length === null}>
        <label htmlFor="access-mode">Access</label>
        <select
          id="access-mode"
          value={restrictions.access}
          onChange={(event) =>
            onAction({
              type: "set-access",
              access: event.target.value as AccessMode,
            })
          }
        >
          <option value="open">Keep lanes open</option>
          <option value="partial" disabled={lanes === null || lanes < 2}>
            Partial lane closure
          </option>
          <option value="closed">Full road closure</option>
        </select>
        {length !== null && (lanes === null || lanes < 2) && (
          <p className="caption">
            {lanes === null
              ? "Lane count unknown — partial closure unavailable."
              : "One mapped lane — use full closure to close it."}
          </p>
        )}
        {restrictions.access === "partial" && (
          <>
            <div className="restriction-field">
              <label htmlFor="closed-lanes">
                Lanes closed <small>of {lanes} mapped lanes</small>
              </label>
              <input
                id="closed-lanes"
                type="number"
                min={1}
                max={(lanes ?? 1) - 1}
                step={1}
                value={restrictions.closedLanes ?? ""}
                aria-invalid={!!laneError}
                aria-describedby={laneError ? "lane-error" : undefined}
                onChange={(event) =>
                  onAction({
                    type: "set-closed-lanes",
                    count:
                      event.target.value === ""
                        ? null
                        : event.target.valueAsNumber,
                  })
                }
              />
            </div>
            {road?.oneway_mode === "two_way" && (
              <p className="caption">
                Lane counts are totals across both directions.
              </p>
            )}
            {laneError && (
              <p className="restriction-error" id="lane-error" role="status">
                {laneError}
              </p>
            )}
          </>
        )}
        {restrictions.access !== "closed" && (
          <>
            <label className="restriction-toggle">
              <input
                type="checkbox"
                checked={restrictions.speedEnabled}
                onChange={(event) =>
                  onAction({
                    type: "toggle-speed",
                    enabled: event.target.checked,
                  })
                }
              />
              Temporary speed limit
            </label>
            {restrictions.speedEnabled && (
              <>
                <div className="restriction-field">
                  <label htmlFor="work-speed">Speed (km/h)</label>
                  <input
                    id="work-speed"
                    type="number"
                    min={1}
                    max={speed ?? undefined}
                    step={1}
                    placeholder="e.g. 20"
                    value={restrictions.speedKmh ?? ""}
                    aria-invalid={!!speedError}
                    aria-describedby={speedError ? "speed-error" : undefined}
                    onChange={(event) =>
                      onAction({
                        type: "set-speed",
                        speed:
                          event.target.value === ""
                            ? null
                            : event.target.valueAsNumber,
                      })
                    }
                  />
                </div>
                {speedError && (
                  <p
                    className="restriction-error"
                    id="speed-error"
                    role="status"
                  >
                    {speedError}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </fieldset>
      {length !== null && (
        <div className="restriction-summary" role="status">
          <small>Configuration · not yet simulated</small>
          <b>
            {Math.round(length)} m · {summary ?? "Complete the fields above"}
          </b>
        </div>
      )}
    </section>
  );
}
