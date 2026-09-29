import type { RoadSelection, RoadSelectionAction } from "../domain/selection";
import { rangeLength } from "../domain/workRange";

export function WorkRangeControls({
  selection,
  onAction,
}: {
  selection: RoadSelection;
  onAction: (action: RoadSelectionAction) => void;
}) {
  const length = rangeLength(selection.range);
  return (
    <div className="work-range-controls">
      <div className="work-range-heading">
        <b>Work range</b>
        <strong>
          {length === null ? "Not set" : `${Math.round(length)} m along road`}
        </strong>
      </div>
      <p role="status">
        {selection.rangeError ??
          (selection.picking
            ? `Click near the blue road to set ${selection.picking === "start" ? "A · start" : "B · end"}.`
            : length === null
              ? "Set two points within this segment."
              : "Purple marks the work range. A / B are its endpoints.")}
      </p>
      <div className="work-range-actions">
        {selection.picking ? (
          <button
            type="button"
            onClick={() => onAction({ type: "cancel-pick" })}
          >
            Cancel
          </button>
        ) : length === null ? (
          <button
            type="button"
            onClick={() =>
              onAction({ type: "pick-endpoint", endpoint: "start" })
            }
          >
            Set work range
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                onAction({ type: "pick-endpoint", endpoint: "start" })
              }
            >
              Move A
            </button>
            <button
              type="button"
              onClick={() =>
                onAction({ type: "pick-endpoint", endpoint: "end" })
              }
            >
              Move B
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: "reset-range" })}
            >
              Reset range
            </button>
          </>
        )}
      </div>
    </div>
  );
}
