import type { RoadProperties, TrafficDayType } from "../types";

export const TRAFFIC_INTERVALS_PER_DAY = 96;

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
        congestionProfile: road.traffic_weekend_congestion_profile,
      }
    : {
        daily: road.traffic_avg_weekday_daily,
        amPeak: road.traffic_am_peak_hour,
        pmPeak: road.traffic_pm_peak_hour,
        observedDays: road.traffic_observed_weekdays,
        volumeProfile: road.traffic_weekday_profile,
        congestionProfile: road.traffic_congestion_profile,
      };
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

export function describeCongestion(value: number | undefined) {
  if (value == null) return { label: "No observed data", className: "no-data" };
  if (value < 35) return { label: "Low", className: "low" };
  if (value < 60) return { label: "Moderate", className: "moderate" };
  if (value < 80) return { label: "High", className: "high" };
  return { label: "Very high", className: "very-high" };
}
