export const TRAFFIC_INTERVALS_PER_DAY = 96;

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
  if (value == null)
    return { label: "No observed data", className: "no-data" };
  if (value < 35) return { label: "Low", className: "low" };
  if (value < 60) return { label: "Moderate", className: "moderate" };
  if (value < 80) return { label: "High", className: "high" };
  return { label: "Very high", className: "very-high" };
}
