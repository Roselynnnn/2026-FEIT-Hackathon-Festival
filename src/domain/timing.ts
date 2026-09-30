import type { RoadProperties, TrafficDayType } from "../types";
import {
  estimatedCapacityPerInterval,
  formatTrafficTime,
  trafficDayLabel,
  trafficForDay,
  TRAFFIC_INTERVALS_PER_DAY,
} from "./traffic";
import {
  mappedLaneCount,
  mappedSpeedLimit,
  restrictionErrors,
  type TrafficRestrictions,
} from "./restrictions";

export const DEFAULT_CONSTRUCTION_DURATION_INTERVALS = 4;
export const MAX_CONSTRUCTION_DURATION_DAYS = 90;
export const MAX_CONSTRUCTION_DURATION_INTERVALS =
  MAX_CONSTRUCTION_DURATION_DAYS * TRAFFIC_INTERVALS_PER_DAY;

export const CONSTRUCTION_DURATION_OPTIONS = [
  { intervals: 1, label: "15 minutes" },
  { intervals: 2, label: "30 minutes" },
  { intervals: 3, label: "45 minutes" },
  { intervals: 4, label: "1 hour" },
  { intervals: 6, label: "1.5 hours" },
  { intervals: 8, label: "2 hours" },
  { intervals: 12, label: "3 hours" },
  { intervals: 16, label: "4 hours" },
  { intervals: 24, label: "6 hours" },
  { intervals: 32, label: "8 hours" },
] as const;

export function isValidConstructionDuration(durationIntervals: number) {
  return (
    Number.isInteger(durationIntervals) &&
    durationIntervals >= 1 &&
    durationIntervals <= MAX_CONSTRUCTION_DURATION_INTERVALS
  );
}

export interface TimingAssessment {
  score: number;
  verdict: string;
  className: "recommended" | "suitable" | "risk" | "avoid";
  averageVolume: number;
  capacityLoad: number;
  peakVolume: number;
  peakCapacityLoad: number;
  trafficReason: string;
  restrictionReason: string;
}

export interface BackupWindow extends TimingAssessment {
  dayType: TrafficDayType;
  startIndex: number;
  label: string;
}

interface WindowTraffic {
  averageVolume: number;
  peakVolume: number;
}

function windowTraffic(
  profile: number[],
  startIndex: number,
  durationIntervals: number,
): WindowTraffic | null {
  const values = Array.from(
    { length: durationIntervals },
    (_, offset) => profile[(startIndex + offset) % TRAFFIC_INTERVALS_PER_DAY],
  );
  if (values.some((value) => !Number.isFinite(value))) return null;
  return {
    averageVolume: values.reduce((sum, value) => sum + value, 0) / values.length,
    peakVolume: Math.max(...values),
  };
}

function restrictionPenalty(
  road: RoadProperties,
  restrictions: TrafficRestrictions,
) {
  const lanes = mappedLaneCount(road)!;
  if (restrictions.access === "closed")
    return {
      value: 30,
      reason: "A full closure has the highest disruption allowance in the score.",
    };
  if (restrictions.access === "partial") {
    const closed = restrictions.closedLanes ?? 0;
    return {
      value: 8 + (closed / lanes) * 18,
      reason: `${closed} of ${lanes} mapped lanes would be closed.`,
    };
  }
  if (restrictions.speedEnabled) {
    const mappedSpeed = mappedSpeedLimit(road);
    const reduction =
      mappedSpeed && restrictions.speedKmh
        ? Math.max(0, 1 - restrictions.speedKmh / mappedSpeed)
        : 0.5;
    return {
      value: 4 + reduction * 8,
      reason: `All lanes stay open with a ${restrictions.speedKmh} km/h temporary limit.`,
    };
  }
  return { value: 0, reason: "All mapped lanes remain open." };
}

function describeTraffic(averageLoad: number, peakLoad: number) {
  const peakNote =
    peakLoad - averageLoad >= 15
      ? ` The busiest 15-minute interval reaches ${Math.round(peakLoad)}% of modelled capacity.`
      : "";
  if (averageLoad < 35)
    return `Traffic is light relative to modelled road capacity.${peakNote}`;
  if (averageLoad < 60)
    return `Traffic is moderate relative to modelled road capacity.${peakNote}`;
  if (averageLoad < 80) return `Traffic is high for temporary works.${peakNote}`;
  if (averageLoad < 100)
    return `Traffic is close to modelled road capacity.${peakNote}`;
  return `Observed demand is at or above modelled road capacity.${peakNote}`;
}

function classifyScore(score: number) {
  if (score >= 80)
    return { verdict: "Recommended window", className: "recommended" as const };
  if (score >= 65)
    return { verdict: "Suitable with controls", className: "suitable" as const };
  if (score >= 45)
    return { verdict: "High disruption risk", className: "risk" as const };
  return { verdict: "Avoid this window", className: "avoid" as const };
}

function assessmentFromTraffic(
  road: RoadProperties,
  restrictions: TrafficRestrictions,
  traffic: WindowTraffic,
  durationIntervals: number,
): TimingAssessment | null {
  if (!isValidConstructionDuration(durationIntervals)) return null;
  const capacity = estimatedCapacityPerInterval(road);
  if (!capacity) return null;
  const capacityLoad = (traffic.averageVolume / capacity) * 100;
  const peakCapacityLoad = (traffic.peakVolume / capacity) * 100;
  const restriction = restrictionPenalty(road, restrictions);
  // A short spike should not be hidden by a quiet average across a longer job.
  const trafficPenalty = Math.min(
    72,
    capacityLoad * 0.55 + Math.max(0, peakCapacityLoad - capacityLoad) * 0.18,
  );
  const durationHours = durationIntervals / 4;
  // The logarithmic curve keeps short jobs distinguishable while still making
  // multi-day and multi-week works meaningfully less suitable.
  const durationPenalty = Math.min(
    28,
    Math.max(0, Math.log2(durationHours)) * 4.5,
  );
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 - trafficPenalty - restriction.value - durationPenalty,
      ),
    ),
  );
  return {
    score,
    ...classifyScore(score),
    averageVolume: Math.round(traffic.averageVolume),
    capacityLoad: Math.round(capacityLoad),
    peakVolume: Math.round(traffic.peakVolume),
    peakCapacityLoad: Math.round(peakCapacityLoad),
    trafficReason: describeTraffic(capacityLoad, peakCapacityLoad),
    restrictionReason: restriction.reason,
  };
}

function restrictionsAreValid(
  road: RoadProperties,
  restrictions: TrafficRestrictions,
) {
  const errors = restrictionErrors(restrictions, road);
  return !errors.laneError && !errors.speedError;
}

export function scoreConstructionWindow(
  road: RoadProperties | null,
  restrictions: TrafficRestrictions,
  startIndex: number,
  dayType: TrafficDayType,
  durationIntervals = DEFAULT_CONSTRUCTION_DURATION_INTERVALS,
): TimingAssessment | null {
  if (
    !road ||
    !restrictionsAreValid(road, restrictions) ||
    !isValidConstructionDuration(durationIntervals)
  )
    return null;
  const profile = trafficForDay(road, dayType)?.volumeProfile;
  if (!profile || profile.length !== TRAFFIC_INTERVALS_PER_DAY) return null;
  const traffic = windowTraffic(profile, startIndex, durationIntervals);
  return traffic == null
    ? null
    : assessmentFromTraffic(
        road,
        restrictions,
        traffic,
        durationIntervals,
      );
}

export function formatConstructionWindow(
  startIndex: number,
  durationIntervals = DEFAULT_CONSTRUCTION_DURATION_INTERVALS,
) {
  const endIndex =
    (startIndex + durationIntervals) % TRAFFIC_INTERVALS_PER_DAY;
  return `${formatTrafficTime(startIndex)}–${formatTrafficTime(endIndex)}`;
}

function windowsOverlap(
  firstStart: number,
  secondStart: number,
  durationIntervals: number,
) {
  const first = new Set(
    Array.from(
      { length: durationIntervals },
      (_, offset) => (firstStart + offset) % TRAFFIC_INTERVALS_PER_DAY,
    ),
  );
  return Array.from(
    { length: durationIntervals },
    (_, offset) => (secondStart + offset) % TRAFFIC_INTERVALS_PER_DAY,
  ).some((interval) => first.has(interval));
}

export function recommendBackupWindows(
  road: RoadProperties | null,
  restrictions: TrafficRestrictions,
  currentIndex: number,
  currentDayType: TrafficDayType,
  durationIntervals = DEFAULT_CONSTRUCTION_DURATION_INTERVALS,
  limit = 2,
): BackupWindow[] {
  if (
    !road ||
    !restrictionsAreValid(road, restrictions) ||
    !isValidConstructionDuration(durationIntervals)
  )
    return [];
  const candidates: BackupWindow[] = [];
  for (const dayType of ["weekday", "weekend"] as const) {
    const profile = trafficForDay(road, dayType)?.volumeProfile;
    if (!profile || profile.length !== TRAFFIC_INTERVALS_PER_DAY) continue;
    for (
      let startIndex = 0;
      startIndex < TRAFFIC_INTERVALS_PER_DAY;
      startIndex += 4
    ) {
      if (
        dayType === currentDayType &&
        windowsOverlap(currentIndex, startIndex, durationIntervals)
      )
        continue;
      const traffic = windowTraffic(
        profile,
        startIndex,
        durationIntervals,
      );
      if (traffic == null) continue;
      const assessment = assessmentFromTraffic(
        road,
        restrictions,
        traffic,
        durationIntervals,
      );
      if (!assessment) continue;
      candidates.push({
        ...assessment,
        dayType,
        startIndex,
        label: `${trafficDayLabel[dayType]} ${formatConstructionWindow(startIndex, durationIntervals)}`,
      });
    }
  }
  const ranked = candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.peakCapacityLoad - b.peakCapacityLoad ||
      a.averageVolume - b.averageVolume ||
      a.startIndex - b.startIndex,
  );
  const selected: BackupWindow[] = [];
  for (const candidate of ranked) {
    const overlapsChosen = selected.some(
      (chosen) =>
        chosen.dayType === candidate.dayType &&
        windowsOverlap(
          chosen.startIndex,
          candidate.startIndex,
          durationIntervals,
        ),
    );
    if (!overlapsChosen) selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}
