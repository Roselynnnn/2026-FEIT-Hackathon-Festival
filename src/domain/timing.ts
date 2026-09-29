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

export const CONSTRUCTION_DURATION_OPTIONS = [
  { intervals: 2, label: "30 minutes" },
  { intervals: 4, label: "1 hour" },
  { intervals: 8, label: "2 hours" },
  { intervals: 16, label: "4 hours" },
  { intervals: 24, label: "6 hours" },
  { intervals: 32, label: "8 hours" },
] as const;

export interface TimingAssessment {
  score: number;
  verdict: string;
  className: "recommended" | "suitable" | "risk" | "avoid";
  averageVolume: number;
  capacityLoad: number;
  trafficReason: string;
  restrictionReason: string;
}

export interface BackupWindow extends TimingAssessment {
  dayType: TrafficDayType;
  startIndex: number;
  label: string;
}

function windowAverage(
  profile: number[],
  startIndex: number,
  durationIntervals: number,
) {
  const values = Array.from(
    { length: durationIntervals },
    (_, offset) => profile[(startIndex + offset) % TRAFFIC_INTERVALS_PER_DAY],
  );
  if (values.some((value) => !Number.isFinite(value))) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function describeTraffic(load: number) {
  if (load < 35) return "Traffic is light relative to modelled road capacity.";
  if (load < 60) return "Traffic is moderate relative to modelled road capacity.";
  if (load < 80) return "Traffic is high for temporary works.";
  if (load < 100) return "Traffic is close to modelled road capacity.";
  return "Observed demand is at or above modelled road capacity.";
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

function assessmentFromVolume(
  road: RoadProperties,
  restrictions: TrafficRestrictions,
  averageVolume: number,
  durationIntervals: number,
): TimingAssessment | null {
  const capacity = estimatedCapacityPerInterval(road);
  if (!capacity) return null;
  const capacityLoad = (averageVolume / capacity) * 100;
  const restriction = restrictionPenalty(road, restrictions);
  const trafficPenalty = Math.min(70, capacityLoad * 0.55);
  const durationHours = durationIntervals / 4;
  const durationPenalty = Math.min(12, Math.max(0, durationHours - 1) * 2);
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
    averageVolume: Math.round(averageVolume),
    capacityLoad: Math.round(capacityLoad),
    trafficReason: describeTraffic(capacityLoad),
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
  if (!road || !restrictionsAreValid(road, restrictions)) return null;
  const profile = trafficForDay(road, dayType)?.volumeProfile;
  if (!profile || profile.length !== TRAFFIC_INTERVALS_PER_DAY) return null;
  const averageVolume = windowAverage(profile, startIndex, durationIntervals);
  return averageVolume == null
    ? null
    : assessmentFromVolume(
        road,
        restrictions,
        averageVolume,
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
  if (!road || !restrictionsAreValid(road, restrictions)) return [];
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
      const averageVolume = windowAverage(
        profile,
        startIndex,
        durationIntervals,
      );
      if (averageVolume == null) continue;
      const assessment = assessmentFromVolume(
        road,
        restrictions,
        averageVolume,
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
      a.averageVolume - b.averageVolume ||
      b.score - a.score ||
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
