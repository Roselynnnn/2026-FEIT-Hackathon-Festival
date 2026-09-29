import type { RoadProperties } from "../types";
import type { TrafficDayType } from "../types";
import { describeRoad } from "../domain/roads";
import {
  describeCongestion,
  formatTrafficTime,
  trafficDayLabel,
  trafficForDay,
} from "../domain/traffic";

export function RoadDetails({
  road,
  isSelected,
  onClearSelection,
  timeIndex,
  dayType,
}: {
  road: RoadProperties | null;
  isSelected: boolean;
  onClearSelection: () => void;
  timeIndex: number;
  dayType: TrafficDayType;
}) {
  const details = road ? describeRoad(road) : null;
  const traffic = trafficForDay(road, dayType);
  const currentVolume = traffic?.volumeProfile?.[timeIndex];
  const currentCongestion = traffic?.congestionProfile?.[timeIndex];
  const congestion = describeCongestion(currentCongestion);
  const hasTraffic = details?.traffic && traffic?.daily != null;
  const dayLabel = trafficDayLabel[dayType];
  return (
    <aside className="sidebar right">
      <h2>{isSelected ? "Selected road" : "Road details"}</h2>
      <div className="caption">
        {isSelected
          ? "This segment stays selected. Click another road to switch."
          : "Hover to preview a road. Click to select its full mapped segment."}
      </div>
      {isSelected && (
        <div className="road-selection-actions">
          <span>Selection locked</span>
          <button type="button" onClick={onClearSelection}>
            Clear selection
          </button>
        </div>
      )}
      {details ? (
        <div id="detail" className="detail visible">
          <div id="detailTitle" className="detail-title">
            {details.title}
          </div>
          <div className="detail-sub">
            {isSelected ? "Selected segment" : "Hover preview"} • OpenStreetMap{" "}
            {road?.osm_id}
          </div>
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
              {hasTraffic && details?.traffic ? (
                <>
                  <strong>
                    {traffic.daily?.toLocaleString("en-AU")} vehicles/day
                  </strong>
                  <div className={`traffic-now ${congestion.className}`}>
                    <div>
                      <small>{formatTrafficTime(timeIndex)} average</small>
                      <b>
                        {currentVolume?.toLocaleString("en-AU") ?? "—"} vehicles
                        / 15 min
                      </b>
                    </div>
                    <em>{congestion.label}</em>
                  </div>
                  <div className="traffic-peaks">
                    <div>
                      <small>AM peak hour</small>
                      <b>{traffic.amPeak?.toLocaleString("en-AU") ?? "—"}</b>
                    </div>
                    <div>
                      <small>PM peak hour</small>
                      <b>{traffic.pmPeak?.toLocaleString("en-AU") ?? "—"}</b>
                    </div>
                  </div>
                  <p>
                    Nearby SCATS site: {details.traffic.site}
                    {details.traffic.distance != null
                      ? ` • ${Math.round(details.traffic.distance)} m from this line`
                      : ""}
                  </p>
                  <small>
                    {dayLabel} average from{" "}
                    {traffic.observedDays ?? "available"} observed days,{" "}
                    {details.traffic.period}. Intersection detector total—not a
                    continuous count for the whole road.
                  </small>
                </>
              ) : (
                <>
                  <strong>
                    {dayType === "weekend"
                      ? "No weekend observations"
                      : "Not observed nearby"}
                  </strong>
                  <p>
                    {dayType === "weekend" && details?.traffic
                      ? "The matched SCATS site has no weekend observations in this reporting period."
                      : "No matching SCATS traffic-signal observation is close enough to this road segment."}
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
          <b>No road selected</b>Hover to preview. Click a road to select it.
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
