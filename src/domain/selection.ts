import type { RoadFeature } from "../types";
import type { RoadPoint, WorkRange } from "./workRange";
import {
  emptyRestrictions,
  mappedLaneCount,
  type AccessMode,
  type TrafficRestrictions,
} from "./restrictions";

export interface RoadSelection {
  hovered: RoadFeature | null;
  selected: RoadFeature | null;
  range: WorkRange;
  picking: "start" | "end" | null;
  rangeError: string | null;
  restrictions: TrafficRestrictions;
}

export type RoadSelectionAction =
  | { type: "hover"; road: RoadFeature | null }
  | { type: "select"; road: RoadFeature }
  | { type: "select-range"; road: RoadFeature; range: WorkRange }
  | { type: "pick-endpoint"; endpoint: "start" | "end" }
  | { type: "place-endpoint"; point: RoadPoint }
  | { type: "reset-range" }
  | { type: "cancel-pick" }
  | { type: "set-access"; access: AccessMode }
  | { type: "set-closed-lanes"; count: number | null }
  | { type: "toggle-speed"; enabled: boolean }
  | { type: "set-speed"; speed: number | null }
  | { type: "clear" };

export const emptyRoadSelection: RoadSelection = {
  hovered: null,
  selected: null,
  range: { start: null, end: null },
  picking: null,
  rangeError: null,
  restrictions: emptyRestrictions,
};

export function roadSelectionReducer(
  state: RoadSelection,
  action: RoadSelectionAction,
): RoadSelection {
  switch (action.type) {
    case "hover":
      // A click owns the inspector until the user switches or clears selection.
      return state.selected || state.hovered === action.road
        ? state
        : { ...state, hovered: action.road };
    case "select":
      return state.selected?.properties.osm_id === action.road.properties.osm_id
        ? state
        : { ...emptyRoadSelection, selected: action.road };
    case "select-range":
      return {
        ...emptyRoadSelection,
        selected: action.road,
        range: action.range,
      };
    case "pick-endpoint":
      return state.selected
        ? { ...state, picking: action.endpoint, rangeError: null }
        : state;
    case "place-endpoint": {
      if (!state.selected || !state.picking) return state;
      const other = state.range[state.picking === "start" ? "end" : "start"];
      if (other && Math.abs(other.distance - action.point.distance) < 1) {
        return { ...state, rangeError: "Choose points at least 1 m apart." };
      }
      return {
        ...state,
        range: { ...state.range, [state.picking]: action.point },
        picking: state.picking === "start" && !state.range.end ? "end" : null,
        rangeError: null,
      };
    }
    case "reset-range":
      return {
        ...state,
        range: { start: null, end: null },
        picking: null,
        rangeError: null,
        restrictions: emptyRestrictions,
      };
    case "cancel-pick":
      return {
        ...state,
        picking: null,
        rangeError: null,
        range:
          state.range.start && state.range.end
            ? state.range
            : { start: null, end: null },
      };
    case "clear":
      return emptyRoadSelection;
    case "set-access": {
      if (!state.range.start || !state.range.end) return state;
      const lanes = mappedLaneCount(state.selected?.properties);
      if (action.access === "partial" && (lanes === null || lanes < 2))
        return state;
      return {
        ...state,
        restrictions:
          action.access === "closed"
            ? { ...emptyRestrictions, access: "closed" }
            : {
                ...state.restrictions,
                access: action.access,
                closedLanes:
                  action.access === "partial"
                    ? (state.restrictions.closedLanes ?? 1)
                    : null,
              },
      };
    }
    case "set-closed-lanes":
      return state.range.start &&
        state.range.end &&
        state.restrictions.access === "partial"
        ? {
            ...state,
            restrictions: { ...state.restrictions, closedLanes: action.count },
          }
        : state;
    case "toggle-speed":
      return state.range.start &&
        state.range.end &&
        state.restrictions.access !== "closed"
        ? {
            ...state,
            restrictions: {
              ...state.restrictions,
              speedEnabled: action.enabled,
              speedKmh: null,
            },
          }
        : state;
    case "set-speed":
      return state.range.start &&
        state.range.end &&
        state.restrictions.speedEnabled &&
        state.restrictions.access !== "closed"
        ? {
            ...state,
            restrictions: { ...state.restrictions, speedKmh: action.speed },
          }
        : state;
  }
}
