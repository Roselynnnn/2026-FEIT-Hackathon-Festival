import type { RoadProperties } from "../types";

export type AccessMode = "open" | "partial" | "closed";

export interface TrafficRestrictions {
  access: AccessMode;
  closedLanes: number | null;
  speedEnabled: boolean;
  speedKmh: number | null;
}

export const emptyRestrictions: TrafficRestrictions = {
  access: "open",
  closedLanes: null,
  speedEnabled: false,
  speedKmh: null,
};

export function mappedLaneCount(road: RoadProperties | undefined) {
  const lanes = road?.lanes_num;
  return lanes != null && Number.isInteger(lanes) && lanes > 0 ? lanes : null;
}

export function mappedSpeedLimit(road: RoadProperties | undefined) {
  return (
    road?.speed_limit_kmh ??
    (road?.maxspeed && /^\d+$/.test(road.maxspeed)
      ? Number(road.maxspeed)
      : null)
  );
}

export function restrictionErrors(
  restrictions: TrafficRestrictions,
  road: RoadProperties | undefined,
) {
  const lanes = mappedLaneCount(road);
  const speed = mappedSpeedLimit(road);
  const laneError =
    restrictions.access === "partial" &&
    (lanes === null ||
      restrictions.closedLanes === null ||
      !Number.isInteger(restrictions.closedLanes) ||
      restrictions.closedLanes < 1 ||
      restrictions.closedLanes >= lanes)
      ? "Leave at least one lane open; use full closure to close all lanes."
      : null;
  const speedError =
    restrictions.access !== "closed" &&
    restrictions.speedEnabled &&
    (restrictions.speedKmh === null ||
      !Number.isInteger(restrictions.speedKmh) ||
      restrictions.speedKmh <= 0 ||
      (speed !== null && restrictions.speedKmh > speed))
      ? speed !== null
        ? `Enter a whole number from 1 to ${speed} km/h.`
        : "Enter a positive whole number in km/h."
      : null;
  return { laneError, speedError };
}

export function restrictionSummary(
  restrictions: TrafficRestrictions,
  road: RoadProperties | undefined,
) {
  const { laneError, speedError } = restrictionErrors(restrictions, road);
  if (laneError || speedError) return null;
  if (restrictions.access === "closed") return "Full road closure";
  const access =
    restrictions.access === "partial"
      ? `Close ${restrictions.closedLanes} / ${mappedLaneCount(road)} lanes`
      : "Keep lanes open";
  return restrictions.speedEnabled
    ? `${access} · ${restrictions.speedKmh} km/h`
    : access;
}
