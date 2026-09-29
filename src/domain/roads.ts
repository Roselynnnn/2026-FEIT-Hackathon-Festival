import type { RoadProperties } from "../types";

export function describeRoad(properties: RoadProperties) {
  const lanes = properties.lanes_num;
  const oneWay =
    properties.oneway_mode === "forward" ||
    properties.oneway_mode === "reverse";
  const heading =
    properties.travel_heading || properties.geometry_forward_heading;
  const laneLabel =
    lanes == null ? "Not recorded" : `${lanes} lane${lanes === 1 ? "" : "s"}`;
  const laneDetail =
    lanes == null
      ? "No lane count is recorded for this road segment."
      : oneWay
        ? `${laneLabel} in the permitted ${heading ? `${heading} ` : ""}direction.`
        : `${laneLabel} total across both directions.`;
  const direction =
    properties.oneway_mode === "two_way"
      ? "Two-way"
      : oneWay
        ? "One-way"
        : null;
  const speedLimit =
    properties.speed_limit_kmh ??
    (properties.maxspeed && /^\d+$/.test(properties.maxspeed)
      ? Number(properties.maxspeed)
      : null);
  const speed = {
    label: speedLimit == null ? "Not recorded" : `${speedLimit} km/h`,
    detail: properties.speed_source
      ? `${properties.speed_source} • ${properties.speed_source_period ?? "current snapshot"}`
      : properties.maxspeed
        ? "OpenStreetMap mapped speed"
        : "No speed-zone match is available for this road segment.",
    conditions: properties.speed_zone_conditions?.join(", ") ?? null,
  };
  const traffic =
    properties.traffic_avg_weekday_daily != null
      ? {
          daily: properties.traffic_avg_weekday_daily.toLocaleString("en-AU"),
          amPeak: properties.traffic_am_peak_hour?.toLocaleString("en-AU"),
          pmPeak: properties.traffic_pm_peak_hour?.toLocaleString("en-AU"),
          site: properties.traffic_site_name ?? `Site ${properties.traffic_site_id}`,
          period: properties.traffic_observation_period,
          distance: properties.traffic_match_distance_m,
        }
      : null;
  const fields = [
    ["Direction", direction],
    ["Surface", properties.surface],
    ["Road class", properties.highway],
  ]
    .filter(
      (field): field is [string, string] => field[1] != null && field[1] !== "",
    )
    .slice(0, 4);
  return {
    title:
      properties.name ||
      properties.seg_descr ||
      properties.featurenam ||
      "Selected road",
    laneLabel,
    laneDetail,
    speed,
    traffic,
    fields,
  };
}
