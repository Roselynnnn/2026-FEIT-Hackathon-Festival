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
  speed_limit_kmh?: number;
  speed_source?: string;
  speed_source_period?: string;
  speed_zone_direction?: string;
  speed_zone_conditions?: string[];
  speed_match_distance_m?: number;
  traffic_site_id?: number;
  traffic_site_name?: string;
  traffic_site_type?: string;
  traffic_match_distance_m?: number;
  traffic_source?: string;
  traffic_avg_weekday_daily?: number;
  traffic_am_peak_hour?: number;
  traffic_pm_peak_hour?: number;
  traffic_observed_weekdays?: number;
  traffic_observation_period?: string;
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
      features?: number;
      source: string;
      dataset_id?: string;
      with_lane_count?: number;
      with_official_speed_limit?: number;
      with_nearby_scats_observation?: number;
      features_matched?: number;
      road_features_matched?: number;
      signal_sites_in_study_area?: number;
      reporting_period?: string;
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
