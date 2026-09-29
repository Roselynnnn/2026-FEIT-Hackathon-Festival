import { formatTrafficTime, TRAFFIC_INTERVALS_PER_DAY } from "../domain/traffic";

export function TrafficTimeBar({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="traffic-timebar" aria-label="Traffic time controls">
      <div className="timebar-heading">
        <div>
          <span>Weekday traffic</span>
          <small>Observed SCATS average • 15-minute intervals</small>
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
