import type { RoadProperties, TrafficDayType } from "../types";

export const TRAFFIC_INTERVALS_PER_DAY = 96;
export const BASE_SATURATION_FLOW_PER_LANE_HOUR = 1_800;
export const DEFAULT_EFFECTIVE_GREEN_RATIO = 0.5;
export const ESTIMATED_CAPACITY_PER_LANE_INTERVAL =
  (BASE_SATURATION_FLOW_PER_LANE_HOUR * DEFAULT_EFFECTIVE_GREEN_RATIO) / 4;

export const trafficDayLabel: Record<TrafficDayType, string> = {
  weekday: "Weekday",
  weekend: "Weekend",
};

export function trafficForDay(
  road: RoadProperties | null,
  dayType: TrafficDayType,
) {
  if (!road) return null;
  return dayType === "weekend"
    ? {
        daily: road.traffic_avg_weekend_daily,
        amPeak: road.traffic_weekend_am_peak_hour,
        pmPeak: road.traffic_weekend_pm_peak_hour,
        observedDays: road.traffic_observed_weekend_days,
        volumeProfile: road.traffic_weekend_profile,
      }
    : {
        daily: road.traffic_avg_weekday_daily,
        amPeak: road.traffic_am_peak_hour,
        pmPeak: road.traffic_pm_peak_hour,
        observedDays: road.traffic_observed_weekdays,
        volumeProfile: road.traffic_weekday_profile,
      };
}

export function estimatedCapacityPerInterval(road: RoadProperties | null) {
  const lanes = road?.lanes_num;
  if (!Number.isFinite(lanes) || !lanes || lanes <= 0) return null;
  return Math.round(lanes * ESTIMATED_CAPACITY_PER_LANE_INTERVAL);
}

export function estimatedCapacityLoad(
  road: RoadProperties | null,
  timeIndex: number,
  dayType: TrafficDayType,
) {
  const volume = trafficForDay(road, dayType)?.volumeProfile?.[timeIndex];
  const capacity = estimatedCapacityPerInterval(road);
  if (volume == null || capacity == null || capacity <= 0) return null;
  return Math.round((volume / capacity) * 100);
}

export function formatTrafficTime(index: number) {
  const safeIndex = Math.max(
    0,
    Math.min(TRAFFIC_INTERVALS_PER_DAY - 1, Math.round(index)),
  );
  const minutes = safeIndex * 15;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function describeCapacityLoad(value: number | null) {
  if (value == null) return { label: "No estimate", className: "no-data" };
  if (value < 35) return { label: "Low load", className: "low" };
  if (value < 60) return { label: "Moderate load", className: "moderate" };
  if (value < 80) return { label: "High load", className: "high" };
  if (value < 100) return { label: "Near capacity", className: "very-high" };
  return { label: "Over modelled capacity", className: "very-high" };
}
