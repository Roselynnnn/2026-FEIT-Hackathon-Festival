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
  const accessValue =
    restrictions.access === "partial"
      ? `partial:${restrictions.closedLanes ?? 1}`
      : restrictions.access;
  const laneWord = lanes === 1 ? "lane" : "lanes";
  return (
    <section className="restriction-controls" aria-label="Traffic restrictions">
      <b>Traffic restrictions</b>
      {length === null && (
        <p className="caption">Set the work range to configure restrictions.</p>
      )}
      {length !== null && lanes !== null && (
        <p className="caption">
          Choices use the {lanes} mapped {laneWord} at the clicked section.
        </p>
      )}
      <fieldset disabled={length === null}>
        <label htmlFor="access-mode">Access</label>
        <select
          id="access-mode"
          value={accessValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value.startsWith("partial:")) {
              onAction({ type: "set-access", access: "partial" });
              onAction({
                type: "set-closed-lanes",
                count: Number(value.split(":")[1]),
              });
            } else {
              onAction({ type: "set-access", access: value as AccessMode });
            }
          }}
        >
          <option value="open">
            {lanes === null
              ? "Keep lanes open"
              : `Keep all ${lanes} ${laneWord} open`}
          </option>
          {lanes !== null &&
            Array.from({ length: Math.max(0, lanes - 1) }, (_, index) => {
              const closed = index + 1;
              return (
                <option key={closed} value={`partial:${closed}`}>
                  Close {closed} of {lanes} {laneWord}
                </option>
              );
            })}
          <option value="closed">
            {lanes === null
              ? "Full road closure"
              : `Full closure · close ${lanes} of ${lanes} ${laneWord}`}
          </option>
        </select>
        {length !== null && lanes === null && (
          <p className="caption">
            Lane count unknown — partial closure unavailable.
          </p>
        )}
        {restrictions.access === "partial" && (
          <>
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
          <small>Configuration · ready for network simulation</small>
          <b>
            {Math.round(length)} m · {summary ?? "Complete the fields above"}
          </b>
        </div>
      )}
    </section>
  );
}
