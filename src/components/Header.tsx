import type { ViewMode } from "../types";

export function Header({
  mode,
  onModeChange,
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">RPM</div>
        <div>
          <h1>Road Twin</h1>
          <p>Queen Victoria Market • 1 km planning area</p>
        </div>
      </div>
      <div className="top-actions">
        <div className="data-status">
          <i />
          Official City of Melbourne data
        </div>
        <div className="view-switch" role="group" aria-label="Map view">
          {(["2d", "3d"] as const).map((view) => (
            <button
              key={view}
              id={`view${view}`}
              className={mode === view ? "active" : ""}
              aria-pressed={mode === view}
              onClick={() => onModeChange(view)}
            >
              {view.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
