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
  const fields = [
    ["Direction", direction],
    ["Speed limit", properties.maxspeed ? `${properties.maxspeed} km/h` : null],
    ["Surface", properties.surface],
    ["Road class", properties.highway],
    ["Last mapped", properties.last_updated],
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
    fields,
  };
}
