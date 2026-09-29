import {
  formatTrafficTime,
  TRAFFIC_INTERVALS_PER_DAY,
} from "../domain/traffic";
import type { TrafficDayType } from "../types";

export function TrafficTimeBar({
  value,
  onChange,
  dayType,
  onDayTypeChange,
}: {
  value: number;
  onChange: (value: number) => void;
  dayType: TrafficDayType;
  onDayTypeChange: (value: TrafficDayType) => void;
}) {
  return (
    <div className="traffic-timebar" aria-label="Traffic time controls">
      <div className="timebar-heading">
        <div className="timebar-copy">
          <div
            className="traffic-day-switch"
            role="group"
            aria-label="Traffic day type"
          >
            {(["weekday", "weekend"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={dayType === option ? "active" : ""}
                aria-pressed={dayType === option}
                onClick={() => onDayTypeChange(option)}
              >
                {option === "weekday" ? "Weekday" : "Weekend"}
              </button>
            ))}
          </div>
          <small>Observed SCATS average • modelled capacity load</small>
        </div>
        <strong>{formatTrafficTime(value)}</strong>
      </div>
      <input
        type="range"
        min="0"
        max={TRAFFIC_INTERVALS_PER_DAY - 1}
        step="1"
        value={value}
        aria-label="Traffic time"
        aria-valuetext={formatTrafficTime(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="timebar-labels" aria-hidden="true">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:45</span>
      </div>
    </div>
  );
}
