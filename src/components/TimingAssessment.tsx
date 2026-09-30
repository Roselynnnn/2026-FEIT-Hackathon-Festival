import { useState } from "react";
import type { TrafficDayType } from "../types";
import type { RoadSelection } from "../domain/selection";
import { restrictionErrors } from "../domain/restrictions";
import {
  MAX_CONSTRUCTION_DURATION_DAYS,
  formatConstructionWindow,
  recommendBackupWindows,
  scoreConstructionWindow,
} from "../domain/timing";
import { trafficDayLabel } from "../domain/traffic";

type DurationUnit = "hours" | "days" | "weeks";

const durationUnitIntervals: Record<DurationUnit, number> = {
  hours: 4,
  days: 96,
  weeks: 96 * 7,
};

const durationUnitLabels: Record<DurationUnit, string> = {
  hours: "hours",
  days: "days",
  weeks: "weeks",
};

function formatDuration(intervals: number) {
  const minutes = intervals * 15;
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 24 * 60)
    return `${Number((minutes / 60).toFixed(2))} hour${minutes === 60 ? "" : "s"}`;
  if (minutes < 7 * 24 * 60)
    return `${Number((minutes / (24 * 60)).toFixed(2))} day${minutes === 24 * 60 ? "" : "s"}`;
  return `${Number((minutes / (7 * 24 * 60)).toFixed(2))} weeks`;
}

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
  const [durationAmount, setDurationAmount] = useState("1");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("hours");
  const numericDuration = Number(durationAmount);
  const durationIntervals = Math.round(
    numericDuration * durationUnitIntervals[durationUnit],
  );
  const durationIsValid =
    Number.isFinite(numericDuration) &&
    numericDuration > 0 &&
    durationIntervals >= 1 &&
    durationIntervals <= MAX_CONSTRUCTION_DURATION_DAYS * 96;
  const durationLabel = durationIsValid
    ? formatDuration(durationIntervals)
    : "an eligible duration";
  const road = selection.selected?.properties ?? null;
  if (!selection.range.start || !selection.range.end || !road) return null;
  const errors = restrictionErrors(selection.restrictions, road);
  const assessment = scoreConstructionWindow(
    road,
    selection.restrictions,
    timeIndex,
    dayType,
    durationIsValid ? durationIntervals : 0,
  );
  const backups = recommendBackupWindows(
    road,
    selection.restrictions,
    timeIndex,
    dayType,
    durationIsValid ? durationIntervals : 0,
  );

  return (
    <section className="timing-assessment" aria-label="Construction timing assessment">
      <div className="duration-control">
        <div>
          <label id="construction-duration-label">Construction duration</label>
          <small>Enter a duration up to {MAX_CONSTRUCTION_DURATION_DAYS} days (about 3 months).</small>
        </div>
        <div className="duration-input" role="group" aria-labelledby="construction-duration-label">
          <input
            aria-label="Construction duration amount"
            type="number"
            min="0.25"
            max={MAX_CONSTRUCTION_DURATION_DAYS * 24 / (durationUnitIntervals[durationUnit] / 4)}
            step="0.25"
            value={durationAmount}
            onChange={(event) => setDurationAmount(event.target.value)}
          />
          <select
            aria-label="Construction duration unit"
            value={durationUnit}
            onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
          >
            {Object.entries(durationUnitLabels).map(([unit, label]) => (
              <option key={unit} value={unit}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="timing-heading">
        <div>
          <small>CONSTRUCTION TIMING</small>
          <b>
            {trafficDayLabel[dayType]}{" "}
            {durationIsValid
              ? `${formatConstructionWindow(timeIndex, durationIntervals)} · ${durationLabel}`
              : "Enter a valid duration"}
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
              <span>Across {durationLabel}</span>
            </div>
            <div>
              <small>Peak load during works</small>
              <b>{assessment.peakCapacityLoad}%</b>
              <span>{assessment.peakVolume.toLocaleString("en-AU")} veh / 15 min</span>
            </div>
          </div>
          <ul>
            <li>{assessment.trafficReason}</li>
            <li>{assessment.restrictionReason}</li>
          </ul>
        </>
      ) : (
        <p className="timing-unavailable">
          {!durationIsValid
            ? `Enter a duration from 15 minutes up to ${MAX_CONSTRUCTION_DURATION_DAYS} days.`
            : errors.laneError || errors.speedError
            ? "Complete the restriction fields to calculate a timing score."
            : "No complete traffic profile and lane capacity are available for this road."}
        </p>
      )}
      {backups.length > 0 && (
        <div className="backup-windows">
          <div className="backup-title">
            <b>Lower-impact alternatives</b>
            <span>Same road · {durationLabel}</span>
          </div>
          {backups.map((backup, index) => (
            <article key={`${backup.dayType}-${backup.startIndex}`}>
              <div className="backup-rank">{index + 1}</div>
              <div className="backup-copy">
                <b>{backup.label}</b>
                <span>
                  Avg {backup.averageVolume.toLocaleString("en-AU")} · peak {backup.peakCapacityLoad}% · score {backup.score}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onDayTypeChange(backup.dayType);
                  onTimeChange(backup.startIndex);
                }}
              >
                Use window
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
