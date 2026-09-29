# QVM Works Digital Twin

An interactive 2D and 3D urban-context visualisation centred on Queen Victoria Market, Melbourne, with a one-kilometre study radius.

## Run

```bash
python3 serve.py
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

If port 8080 is busy, the app may already be open at that address. To run a
second copy on another port, use:

```bash
PORT=8081 python3 serve.py
```

## What the demo shows

- 2D planning view and 3D building-massing view.
- 2023 City of Melbourne building footprints extruded using supplied structure height.
- Public road and laneway corridor polygons.
- Clickable road centre-lines with recorded total, forward and backward lane counts, one-way status and speed limit where available.
- Development activity footprints coloured by status.
- Development Activity Monitor project points.
- 2022 CLUE building information and CLUE small-area boundaries.
- Clickable feature inspector and independent layer controls.

## Data scope

The local GeoJSON files contain features whose official dataset centroid is within one kilometre of the Queen Victoria Market reference point (`144.9568, -37.8076`). The blue circle shows that study area.

Refresh the official data with:

```bash
python3 scripts/fetch_data.py
```

## Official sources

- [2023 Building Footprints](https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/information/)
- [Road Corridors](https://data.melbourne.vic.gov.au/explore/dataset/road-corridors/information/)
- [Development Activity Model Footprints](https://data.melbourne.vic.gov.au/explore/dataset/development-activity-model-footprints/information/)
- [Development Activity Monitor](https://data.melbourne.vic.gov.au/explore/dataset/development-activity-monitor/information/)
- [CLUE Small Areas](https://data.melbourne.vic.gov.au/explore/dataset/small-areas-for-census-of-land-use-and-employment-clue/information/)
- [Building Information](https://data.melbourne.vic.gov.au/explore/dataset/buildings-with-name-age-size-accessibility-and-bicycle-facilities/information/)
- [OpenStreetMap lane tags](https://www.openstreetmap.org/copyright)

City of Melbourne datasets are used under their published open-data terms. Development model polygons and heights are indicative and should not be treated as survey-grade measurements. The City road-corridor data does not publish lane counts, so the demo overlays explicitly mapped OpenStreetMap lane tags. Missing lane values are displayed as `Not recorded` rather than inferred.

Lane semantics are shown explicitly in the inspector:

- On a one-way segment, `3 lanes` means three lanes in the permitted travel direction and zero in the opposite direction.
- On a two-way segment, the total is the combined count across both directions.
- Directional counts are only displayed when `lanes:forward` and `lanes:backward` are recorded; otherwise the directional split says `Not separately recorded`.
