import type { FeatureCollection, LineString, Geometry } from "geojson";

export type ViewMode = "2d" | "3d";
export type LayerId = "buildings" | "developments" | "roads";
export type LayerVisibility = Record<LayerId, boolean>;

export interface RoadProperties {
  osm_id?: number;
  way_id?: number;
  name?: string;
  seg_descr?: string;
  featurenam?: string;
  lanes_num?: number;
  lanes_forward?: number;
  lanes_backward?: number;
  oneway_mode?: "forward" | "reverse" | "two_way";
  travel_heading?: string;
  geometry_forward_heading?: string;
  geometry_backward_heading?: string;
  maxspeed?: string;
  surface?: string;
  highway?: string;
  last_updated?: string;
}

export interface Manifest {
  centre: { name: string; longitude: number; latitude: number };
  radius_m: number;
  datasets: Record<
    string,
    {
      features: number;
      source: string;
      dataset_id?: string;
      with_lane_count?: number;
    }
  >;
}

export interface MapData {
  manifest: Manifest;
  study_area: FeatureCollection;
  buildings: FeatureCollection<Geometry, { height?: number }>;
  roads: FeatureCollection;
  road_lanes: FeatureCollection<LineString, RoadProperties>;
  developments: FeatureCollection;
}
