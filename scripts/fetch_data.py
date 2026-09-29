#!/usr/bin/env python3
"""Download and compact official City of Melbourne data around Queen Victoria Market."""

from __future__ import annotations

import json
import math
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import certifi
except ImportError:
    certifi = None


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
API = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets"
CENTER = (144.9568, -37.8076)
RADIUS_METRES = 1000

DATASETS = {
    "buildings": {
        "id": "2023-building-footprints",
        "geo_field": "geo_point_2d",
        "keep": [
            "structure_id",
            "footprint_type",
            "roof_type",
            "structure_extrusion",
            "footprint_extrusion",
            "date_captured",
        ],
    },
    "roads": {
        "id": "road-corridors",
        "geo_field": "geo_point_2d",
        "keep": ["seg_id", "str_type", "seg_descr", "street_id"],
    },
    "developments": {
        "id": "development-activity-model-footprints",
        "geo_field": "geo_point_2d",
        "keep": [
            "dev_key",
            "status",
            "permit_num",
            "bldhgt_ahd",
            "base_ahd",
            "address",
            "num_floors",
            "land_use_1",
            "shape_type",
            "datadate",
        ],
    },
    "development_points": {
        "id": "development-activity-monitor",
        "geo_field": "geopoint",
        "keep": [
            "development_key",
            "status",
            "year_completed",
            "street_address",
            "floors_above",
            "resi_dwellings",
            "office_flr",
            "retail_flr",
            "car_spaces",
            "bike_spaces",
        ],
    },
    "clue_areas": {
        "id": "small-areas-for-census-of-land-use-and-employment-clue",
        "geo_field": "geo_point_2d",
        "keep": ["featurenam"],
    },
    "building_info": {
        "id": "buildings-with-name-age-size-accessibility-and-bicycle-facilities",
        "geo_field": "location",
        "refine": "census_year:2022",
        "keep": [
            "property_id",
            "building_name",
            "street_address",
            "construction_year",
            "number_of_floors_above_ground",
            "predominant_space_use",
            "accessibility_rating",
            "bicycle_spaces",
            "has_showers",
        ],
    },
}

DRIVABLE_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "unclassified",
    "residential",
    "living_street",
    "service",
    "road",
}


def ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where()) if certifi else ssl.create_default_context()


def round_coordinates(value):
    if isinstance(value, list):
        return [round_coordinates(item) for item in value]
    if isinstance(value, float):
        return round(value, 6)
    return value


def download_geojson(config: dict) -> dict:
    lon, lat = CENTER
    where = f"within_distance({config['geo_field']}, geom'POINT({lon} {lat})', 1km)"
    params: list[tuple[str, str]] = [("where", where)]
    if config.get("refine"):
        params.append(("refine", config["refine"]))
    url = f"{API}/{config['id']}/exports/geojson?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "QVM-Digital-Twin-Hackathon/1.0"})
    with urllib.request.urlopen(request, context=ssl_context(), timeout=180) as response:
        return json.load(response)


def compact(name: str, data: dict, config: dict) -> dict:
    output = []
    for feature in data.get("features", []):
        properties = feature.get("properties") or {}
        selected = {key: properties.get(key) for key in config["keep"] if properties.get(key) is not None}
        if name == "buildings":
            selected["height"] = round(
                max(
                    2.5,
                    float(properties.get("structure_extrusion") or 0),
                    float(properties.get("footprint_extrusion") or 0),
                ),
                1,
            )
        elif name == "developments":
            height = float(properties.get("bldhgt_ahd") or 0) - float(properties.get("base_ahd") or 0)
            selected["height"] = round(max(3.0, height), 1)
        output.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": feature["geometry"]["type"],
                    "coordinates": round_coordinates(feature["geometry"]["coordinates"]),
                },
                "properties": selected,
            }
        )
    return {"type": "FeatureCollection", "features": output}


def radius_feature() -> dict:
    lon, lat = CENTER
    coordinates = []
    for index in range(97):
        angle = 2 * math.pi * index / 96
        dx = RADIUS_METRES * math.cos(angle)
        dy = RADIUS_METRES * math.sin(angle)
        point_lon = lon + dx / (111_320 * math.cos(math.radians(lat)))
        point_lat = lat + dy / 110_540
        coordinates.append([round(point_lon, 6), round(point_lat, 6)])
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                "properties": {"name": "Queen Victoria Market 1 km study area", "radius_m": 1000},
            }
        ],
    }


def parse_lane_number(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    return int(text) if text.isdigit() else None


def compass_pair(coordinates: list[dict]) -> tuple[str, str]:
    """Return the geometry-forward and geometry-backward compass headings."""
    start, end = coordinates[0], coordinates[-1]
    delta_lon = end["lon"] - start["lon"]
    delta_lat = end["lat"] - start["lat"]
    bearing = (math.degrees(math.atan2(delta_lon, delta_lat)) + 360) % 360
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    forward = directions[round(bearing / 45) % 8]
    backward = directions[(round(bearing / 45) + 4) % 8]
    return forward, backward


def download_osm_lanes() -> dict:
    """Fetch mapped lane tags for drivable roads from OpenStreetMap Overpass."""
    lon, lat = CENTER
    query = f'[out:json][timeout:60];way(around:{RADIUS_METRES},{lat},{lon})["highway"];out meta geom;'
    request = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
        headers={"User-Agent": "QVM-Digital-Twin-Hackathon/1.0"},
    )
    with urllib.request.urlopen(request, context=ssl_context(), timeout=120) as response:
        data = json.load(response)

    features = []
    for element in data.get("elements", []):
        tags = element.get("tags") or {}
        if element.get("type") != "way" or tags.get("highway") not in DRIVABLE_HIGHWAYS:
            continue
        geometry = element.get("geometry") or []
        if len(geometry) < 2:
            continue
        forward = parse_lane_number(tags.get("lanes:forward"))
        backward = parse_lane_number(tags.get("lanes:backward"))
        total = parse_lane_number(tags.get("lanes"))
        if total is None and forward is not None and backward is not None:
            total = forward + backward
        oneway_tag = str(tags.get("oneway") or "no").lower()
        if oneway_tag in {"yes", "1", "true"}:
            oneway_mode = "forward"
            if forward is None:
                forward = total
            backward = 0
        elif oneway_tag == "-1":
            oneway_mode = "reverse"
            forward = 0
            if backward is None:
                backward = total
        else:
            oneway_mode = "two_way"
        geometry_forward, geometry_backward = compass_pair(geometry)
        if total is not None:
            lane_word = "lane" if total == 1 else "lanes"
            lane_label = f"{total} {lane_word} one-way" if oneway_mode != "two_way" else f"{total} {lane_word} total"
        else:
            lane_label = None
        properties = {
            "osm_id": element.get("id"),
            "name": tags.get("name") or "Unnamed road",
            "highway": tags.get("highway"),
            "lanes": tags.get("lanes"),
            "lanes_num": total,
            "lanes_forward": forward,
            "lanes_backward": backward,
            "oneway": tags.get("oneway") or "no",
            "oneway_mode": oneway_mode,
            "geometry_forward_heading": geometry_forward,
            "geometry_backward_heading": geometry_backward,
            "travel_heading": geometry_backward if oneway_mode == "reverse" else geometry_forward,
            "lane_label": lane_label,
            "maxspeed": tags.get("maxspeed"),
            "surface": tags.get("surface"),
            "last_updated": element.get("timestamp"),
            "lane_source": "OpenStreetMap",
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[round(node["lon"], 6), round(node["lat"], 6)] for node in geometry],
                },
                "properties": {key: value for key, value in properties.items() if value is not None},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "centre": {"name": "Queen Victoria Market", "longitude": CENTER[0], "latitude": CENTER[1]},
        "radius_m": RADIUS_METRES,
        "datasets": {},
    }
    for name, config in DATASETS.items():
        print(f"Downloading {name}…")
        compacted = compact(name, download_geojson(config), config)
        output_path = DATA_DIR / f"{name}.geojson"
        output_path.write_text(json.dumps(compacted, separators=(",", ":")), encoding="utf-8")
        manifest["datasets"][name] = {
            "dataset_id": config["id"],
            "features": len(compacted["features"]),
            "source": f"https://data.melbourne.vic.gov.au/explore/dataset/{config['id']}/information/",
        }
        print(f"  {len(compacted['features']):,} features -> {output_path.name}")
    print("Downloading OpenStreetMap lane tags…")
    lane_data = download_osm_lanes()
    lane_path = DATA_DIR / "road_lanes.geojson"
    lane_path.write_text(json.dumps(lane_data, separators=(",", ":")), encoding="utf-8")
    mapped_count = sum(1 for feature in lane_data["features"] if feature["properties"].get("lanes_num"))
    manifest["datasets"]["road_lanes"] = {
        "features": len(lane_data["features"]),
        "with_lane_count": mapped_count,
        "source": "https://www.openstreetmap.org/copyright",
    }
    print(f"  {len(lane_data['features']):,} drivable segments, {mapped_count:,} with lane counts")
    (DATA_DIR / "study_area.geojson").write_text(
        json.dumps(radius_feature(), separators=(",", ":")), encoding="utf-8"
    )
    (DATA_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Done.")


if __name__ == "__main__":
    main()
