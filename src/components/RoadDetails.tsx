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
            <div className="data-summary speed-summary">
              <span>Speed limit</span>
              <strong>{details.speed.label}</strong>
              <p>{details.speed.detail}</p>
              {details.speed.conditions && (
                <small>{details.speed.conditions}</small>
              )}
            </div>
            <div className="lane-summary">
              <span>Mapped lane count</span>
              <strong>{details.laneLabel}</strong>
              <p>{details.laneDetail}</p>
            </div>
            <div className="data-summary traffic-summary">
              <span>Observed traffic</span>
              {details.traffic ? (
                <>
                  <strong>{details.traffic.daily} vehicles/day</strong>
                  <div className="traffic-peaks">
                    <div>
                      <small>AM peak hour</small>
                      <b>{details.traffic.amPeak ?? "—"}</b>
                    </div>
                    <div>
                      <small>PM peak hour</small>
                      <b>{details.traffic.pmPeak ?? "—"}</b>
                    </div>
                  </div>
                  <p>
                    Nearby SCATS site: {details.traffic.site}
                    {details.traffic.distance != null
                      ? ` • ${Math.round(details.traffic.distance)} m from this line`
                      : ""}
                  </p>
                  <small>
                    Weekday average, {details.traffic.period}. Intersection
                    detector total—not a continuous count for the whole road.
                  </small>
                </>
              ) : (
                <>
                  <strong>Not observed nearby</strong>
                  <p>
                    No matching SCATS traffic-signal observation is close enough
                    to this road segment.
                  </p>
                </>
              )}
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
          href="https://opendata.transport.vic.gov.au/dataset/speed-zones"
          target="_blank"
          rel="noreferrer"
        >
          DTP Speed Zones ↗
        </a>
        <a
          href="https://opendata.transport.vic.gov.au/dataset/traffic-signal-volume-data"
          target="_blank"
          rel="noreferrer"
        >
          DTP SCATS Traffic Volume ↗
        </a>
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
        Speed limits use DTP Speed Zones where spatially matched, with OSM only
        as a fallback. Traffic figures are observed nearby intersection totals;
        missing coverage stays “Not observed” and is never fabricated.
      </div>
    </aside>
  );
}
