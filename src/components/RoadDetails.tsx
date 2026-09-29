import type { RoadProperties } from "../types";
import { describeRoad } from "../domain/roads";

export function RoadDetails({ road }: { road: RoadProperties | null }) {
  const details = road ? describeRoad(road) : null;
  return (
    <aside className="sidebar right">
      <h2>Road details</h2>
      <div className="caption">
        Hover over or click a blue road to view its mapped details.
      </div>
      {details ? (
        <div id="detail" className="detail visible">
          <div id="detailTitle" className="detail-title">
            {details.title}
          </div>
          <div className="detail-sub">Road lane record • OpenStreetMap</div>
          <div className="detail-grid">
            <div className="lane-summary">
              <span>Mapped lane count</span>
              <strong>{details.laneLabel}</strong>
              <p>{details.laneDetail}</p>
            </div>
            {details.fields.map(([label, value]) => (
              <div className="detail-item" key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="selection-empty">
          <b>No road selected</b>Hover over or click a blue road to view its
          details.
        </div>
      )}
      <h3>Sources</h3>
      <div className="source-list">
        <a
          href="https://data.melbourne.vic.gov.au/explore/dataset/road-corridors/information/"
          target="_blank"
          rel="noreferrer"
        >
          Road Corridors ↗
        </a>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap lane tags ↗
        </a>
      </div>
      <div className="disclaimer">
        Lane counts come from mapped OpenStreetMap tags. Missing values stay as
        “Not recorded”.
      </div>
    </aside>
  );
}
