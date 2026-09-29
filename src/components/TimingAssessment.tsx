import { useState } from "react";
import type { TrafficDayType } from "../types";
import type { RoadSelection } from "../domain/selection";
import { restrictionErrors } from "../domain/restrictions";
import {
  CONSTRUCTION_DURATION_OPTIONS,
  DEFAULT_CONSTRUCTION_DURATION_INTERVALS,
  formatConstructionWindow,
  recommendBackupWindows,
  scoreConstructionWindow,
} from "../domain/timing";
import { trafficDayLabel } from "../domain/traffic";

export function TimingAssessment({
  selection,
  timeIndex,
  dayType,
  onTimeChange,
  onDayTypeChange,
}: {
  selection: RoadSelection;
  timeIndex: number;
  dayType: TrafficDayType;
  onTimeChange: (value: number) => void;
  onDayTypeChange: (value: TrafficDayType) => void;
}) {
  const [durationIntervals, setDurationIntervals] = useState(
    DEFAULT_CONSTRUCTION_DURATION_INTERVALS,
  );
  const road = selection.selected?.properties ?? null;
  if (!selection.range.start || !selection.range.end || !road) return null;
  const errors = restrictionErrors(selection.restrictions, road);
  const assessment = scoreConstructionWindow(
    road,
    selection.restrictions,
    timeIndex,
    dayType,
    durationIntervals,
  );
  const backups = recommendBackupWindows(
    road,
    selection.restrictions,
    timeIndex,
    dayType,
    durationIntervals,
  );

  return (
    <section className="timing-assessment" aria-label="Construction timing assessment">
      <div className="duration-control">
        <label htmlFor="construction-duration">Construction duration</label>
        <select
          id="construction-duration"
          value={durationIntervals}
          onChange={(event) => setDurationIntervals(Number(event.target.value))}
        >
          {CONSTRUCTION_DURATION_OPTIONS.map((option) => (
            <option key={option.intervals} value={option.intervals}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="timing-heading">
        <div>
          <small>CONSTRUCTION TIMING</small>
          <b>
            {trafficDayLabel[dayType]}{" "}
            {formatConstructionWindow(timeIndex, durationIntervals)}
          </b>
        </div>
        {assessment && (
          <div className={`timing-score ${assessment.className}`}>
            <strong>{assessment.score}</strong>
            <span>/100</span>
          </div>
        )}
      </div>
      {assessment ? (
        <>
          <div className={`timing-verdict ${assessment.className}`}>
            {assessment.verdict}
          </div>
          <div className="timing-metrics">
            <div>
              <small>Average flow</small>
              <b>{assessment.averageVolume.toLocaleString("en-AU")} veh / 15 min</b>
            </div>
            <div>
              <small>Capacity load</small>
              <b>{assessment.capacityLoad}%</b>
            </div>
          </div>
          <ul>
            <li>{assessment.trafficReason}</li>
            <li>{assessment.restrictionReason}</li>
          </ul>
        </>
      ) : (
        <p className="timing-unavailable">
          {errors.laneError || errors.speedError
            ? "Complete the restriction fields to calculate a timing score."
            : "No complete traffic profile and lane capacity are available for this road."}
        </p>
      )}
      {backups.length > 0 && (
        <div className="backup-windows">
          <div className="backup-title">
            <b>Two lightest-flow backups</b>
            <span>Same road · same duration</span>
          </div>
          {backups.map((backup, index) => (
            <article key={`${backup.dayType}-${backup.startIndex}`}>
              <div className="backup-rank">{index + 1}</div>
              <div className="backup-copy">
                <b>{backup.label}</b>
                <span>
                  {backup.averageVolume.toLocaleString("en-AU")} veh / 15 min · score {backup.score}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onDayTypeChange(backup.dayType);
                  onTimeChange(backup.startIndex);
                }}
              >
                Use
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="timing-note">
        Screening estimate from observed SCATS averages, mapped lanes and the selected restriction—not an approval or safety assessment.
      </p>
    </section>
  );
}
