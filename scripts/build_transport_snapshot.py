#!/usr/bin/env python3
"""Enrich QVM road lines with official speed zones and SCATS observations.

The large statewide source files are intentionally not committed. Download them
to a temporary directory, then pass their paths to this script. The generated
road_lanes.geojson stays small enough for the browser demo.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Iterator


CENTRE = (144.9568, -37.8076)
STUDY_RADIUS_M = 1_000
SIGNAL_RADIUS_M = 1_200
SPEED_MATCH_LIMIT_M = 24
TRAFFIC_MATCH_LIMIT_M = 70
ROAD_TYPE_WORDS = {
    "ALLEY",
    "AVENUE",
    "BOULEVARD",
    "COURT",
    "DRIVE",
    "HIGHWAY",
    "LANE",
    "PARADE",
    "PLACE",
    "ROAD",
    "STREET",
    "TERRACE",
}


def iter_geojson_features(path: Path) -> Iterator[dict]:
    """Stream a compact FeatureCollection without loading it all into RAM."""
    with path.open(encoding="utf-8") as source:
        prefix = ""
        while '"features"' not in prefix:
            chunk = source.read(65_536)
            if not chunk:
                raise ValueError(f"{path}: missing features array")
            prefix = (prefix + chunk)[-131_072:]
        while "[" not in prefix[prefix.index('"features"') :]:
            chunk = source.read(65_536)
            if not chunk:
                raise ValueError(f"{path}: incomplete features array")
            prefix += chunk
        tail = prefix[prefix.index("[", prefix.index('"features"')) + 1 :]
        depth = 0
        in_string = False
        escaped = False
        feature: list[str] = []

        def consume(text: str) -> Iterator[dict]:
            nonlocal depth, in_string, escaped, feature
            for char in text:
                if depth == 0:
                    if char == "]":
                        return
                    if char != "{":
                        continue
                    depth = 1
                    feature = [char]
                    continue
                feature.append(char)
                if in_string:
                    if escaped:
                        escaped = False
                    elif char == "\\":
                        escaped = True
                    elif char == '"':
                        in_string = False
                elif char == '"':
                    in_string = True
                elif char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        yield json.loads("".join(feature))
                        feature = []

        yield from consume(tail)
        for chunk in iter(lambda: source.read(1_048_576), ""):
            yield from consume(chunk)


def coordinate_pairs(value) -> Iterator[tuple[float, float]]:
    if (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        yield float(value[0]), float(value[1])
    elif isinstance(value, list):
        for child in value:
            yield from coordinate_pairs(child)


def line_parts(geometry: dict) -> list[list[tuple[float, float]]]:
    coordinates = geometry.get("coordinates", [])
    if geometry.get("type") == "LineString":
        return [[tuple(point) for point in coordinates]]
    if geometry.get("type") == "MultiLineString":
        return [[tuple(point) for point in line] for line in coordinates]
    return []


def xy(point: tuple[float, float]) -> tuple[float, float]:
    lon, lat = point
    return (
        (lon - CENTRE[0]) * 111_320 * math.cos(math.radians(CENTRE[1])),
        (lat - CENTRE[1]) * 110_540,
    )


def point_segment_distance(point, start, end) -> float:
    px, py = xy(point)
    ax, ay = xy(start)
    bx, by = xy(end)
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    ratio = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy))


def segment_distance(a, b, c, d) -> float:
    return min(
        point_segment_distance(a, c, d),
        point_segment_distance(b, c, d),
        point_segment_distance(c, a, b),
        point_segment_distance(d, a, b),
    )


def angle_difference(a, b, c, d) -> float:
    ax, ay = xy(a)
    bx, by = xy(b)
    cx, cy = xy(c)
    dx, dy = xy(d)
    first = math.degrees(math.atan2(by - ay, bx - ax)) % 180
    second = math.degrees(math.atan2(dy - cy, dx - cx)) % 180
    difference = abs(first - second)
    return min(difference, 180 - difference)


def distance_to_line(point, coordinates) -> float:
    return min(
        point_segment_distance(point, start, end)
        for start, end in zip(coordinates, coordinates[1:])
    )


def haversine_m(first, second) -> float:
    lon1, lat1 = map(math.radians, first)
    lon2, lat2 = map(math.radians, second)
    delta_lon, delta_lat = lon2 - lon1, lat2 - lat1
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return 12_742_000 * math.asin(math.sqrt(value))


def load_speed_segments(path: Path):
    segments = []
    for feature in iter_geojson_features(path):
        geometry = feature.get("geometry") or {}
        points = list(coordinate_pairs(geometry.get("coordinates")))
        if not points or min(haversine_m(CENTRE, point) for point in points) > 1_600:
            continue
        properties = feature.get("properties", {})
        try:
            limit = int(properties["speed_limit"])
        except (KeyError, TypeError, ValueError):
            continue
        for part in line_parts(geometry):
            for start, end in zip(part, part[1:]):
                segments.append((start, end, limit, properties))
    return segments


def load_signals(path: Path):
    signals = {}
    with path.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            try:
                point = (float(row["LONGITUDE"]), float(row["LATITUDE"]))
            except (KeyError, TypeError, ValueError):
                continue
            if haversine_m(CENTRE, point) <= SIGNAL_RADIUS_M:
                signals[row["SITE_NO"]] = {**row, "point": point}
    return signals


def load_scats_metrics(path: Path, site_ids: set[str]):
    by_site_day = defaultdict(lambda: defaultdict(lambda: [0] * 96))
    with zipfile.ZipFile(path) as archive:
        for filename in archive.namelist():
            if not filename.lower().endswith(".csv"):
                continue
            with archive.open(filename) as raw:
                reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
                for row in reader:
                    site = row.get("NB_SCATS_SITE", "")
                    day = row.get("QT_INTERVAL_COUNT", "")
                    if site not in site_ids or not day:
                        continue
                    profile = by_site_day[site][day]
                    for index in range(96):
                        try:
                            profile[index] += int(row.get(f"V{index:02d}") or 0)
                        except ValueError:
                            pass

    metrics = {}
    for site, days in by_site_day.items():
        weekday_profiles = [
            profile
            for day, profile in days.items()
            if date.fromisoformat(day).weekday() < 5
        ]
        if not weekday_profiles:
            continue
        average = [
            round(sum(profile[index] for profile in weekday_profiles) / len(weekday_profiles))
            for index in range(96)
        ]

        def peak_hour(start: int, end: int) -> int:
            return max(sum(average[index : index + 4]) for index in range(start, end - 3))

        metrics[site] = {
            "traffic_avg_weekday_daily": sum(average),
            "traffic_am_peak_hour": peak_hour(24, 41),
            "traffic_pm_peak_hour": peak_hour(60, 77),
            "traffic_observed_weekdays": len(weekday_profiles),
            "traffic_observation_period": f"{min(days)} to {max(days)}",
        }
    return metrics


def road_tokens(name: str) -> set[str]:
    words = set(re.findall(r"[A-Z]+", name.upper()))
    return {word for word in words - ROAD_TYPE_WORDS if len(word) >= 4}


def enrich_road(feature, speed_segments, signals, traffic_metrics):
    properties = feature.setdefault("properties", {})
    parts = line_parts(feature.get("geometry", {}))
    road_segments = [pair for part in parts for pair in zip(part, part[1:])]
    if not road_segments:
        return False, False

    speed_matches = []
    for road_start, road_end in road_segments:
        for zone_start, zone_end, limit, zone in speed_segments:
            angle = angle_difference(road_start, road_end, zone_start, zone_end)
            if angle > 35:
                continue
            distance = segment_distance(road_start, road_end, zone_start, zone_end)
            if distance <= SPEED_MATCH_LIMIT_M:
                speed_matches.append((distance + angle * 0.25, distance, limit, zone))
    speed_found = bool(speed_matches)
    if speed_found:
        _, distance, limit, zone = min(speed_matches, key=lambda match: match[0])
        properties.update(
            speed_limit_kmh=limit,
            speed_source="DTP Speed Zones",
            speed_source_period="August 2026",
            speed_zone_direction=zone.get("direction"),
            speed_zone_conditions=zone.get("zone_conditions", []),
            speed_match_distance_m=round(distance, 1),
        )

    tokens = road_tokens(str(properties.get("name", "")))
    traffic_matches = []
    if tokens:
        for site_id, signal in signals.items():
            if site_id not in traffic_metrics:
                continue
            if not tokens.intersection(road_tokens(signal["SITE_NAME"])):
                continue
            distance = min(distance_to_line(signal["point"], part) for part in parts)
            if distance <= TRAFFIC_MATCH_LIMIT_M:
                traffic_matches.append((distance, site_id, signal))
    traffic_found = bool(traffic_matches)
    if traffic_found:
        distance, site_id, signal = min(traffic_matches, key=lambda match: match[0])
        properties.update(
            traffic_site_id=int(site_id),
            traffic_site_name=signal["SITE_NAME"],
            traffic_site_type=signal["TYPE"],
            traffic_match_distance_m=round(distance, 1),
            traffic_source="DTP SCATS Traffic Signal Volume Data",
            **traffic_metrics[site_id],
        )
    return speed_found, traffic_found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speed-zones", type=Path, required=True)
    parser.add_argument("--traffic-signals", type=Path, required=True)
    parser.add_argument("--scats", type=Path, required=True)
    parser.add_argument("--roads", type=Path, default=Path("data/road_lanes.geojson"))
    parser.add_argument("--manifest", type=Path, default=Path("data/manifest.json"))
    args = parser.parse_args()

    speed_segments = load_speed_segments(args.speed_zones)
    signals = load_signals(args.traffic_signals)
    traffic_metrics = load_scats_metrics(args.scats, set(signals))
    roads = json.loads(args.roads.read_text(encoding="utf-8"))
    speed_count = traffic_count = 0
    for feature in roads["features"]:
        speed, traffic = enrich_road(feature, speed_segments, signals, traffic_metrics)
        speed_count += speed
        traffic_count += traffic
    args.roads.write_text(
        json.dumps(roads, separators=(",", ":")), encoding="utf-8"
    )

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    dataset = manifest["datasets"]["road_lanes"]
    dataset.update(
        with_official_speed_limit=speed_count,
        with_nearby_scats_observation=traffic_count,
    )
    manifest["datasets"]["speed_zones"] = {
        "features_matched": speed_count,
        "reporting_period": "August 2026",
        "source": "https://opendata.transport.vic.gov.au/dataset/speed-zones",
    }
    manifest["datasets"]["traffic_signal_volume"] = {
        "road_features_matched": traffic_count,
        "signal_sites_in_study_area": len(signals),
        "reporting_period": next(iter(traffic_metrics.values()), {}).get(
            "traffic_observation_period", "September 2026"
        ),
        "source": "https://opendata.transport.vic.gov.au/dataset/traffic-signal-volume-data",
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Loaded {len(speed_segments):,} nearby official speed-zone segments")
    print(f"Matched official speed limits to {speed_count:,}/{len(roads['features']):,} roads")
    print(f"Loaded SCATS observations for {len(traffic_metrics):,}/{len(signals):,} nearby sites")
    print(f"Matched a nearby SCATS observation to {traffic_count:,}/{len(roads['features']):,} roads")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
