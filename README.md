# QVM Works Digital Twin

A React + TypeScript + Vite application showing the urban context around Queen Victoria Market, Melbourne, within a one-kilometre study area. MapLibre renders the 2D map and 3D building massing.

This is currently a map exploration prototype with official speed-zone matches,
nearby observed SCATS traffic summaries and a transparent screening estimate of
capacity load. Construction objects, traffic simulation and plan optimisation
are not implemented yet.

## Requirements

- Node.js **22.12 or newer** (Node.js 22 LTS recommended; `.nvmrc` selects 22).
- npm, included with Node.js.
- Internet access for the OpenFreeMap basemap, tiles and fonts. The study-area GeoJSON is served locally.
- Python is only needed to refresh source data or use the optional production preview server.

## Run on macOS, Windows or Linux

```bash
# If you use nvm: nvm install && nvm use
npm ci
npm run dev
```

Open http://127.0.0.1:8080. Vite provides hot reload. If port 8080 is in use:

```bash
npm run dev -- --port 8081
```

After pulling changes to `package.json` or `package-lock.json`, run `npm ci` again.

### Windows double-click launcher

Install Node.js, then double-click `start-windows.bat`. The launcher installs dependencies on the first run and starts Vite with a browser window. Keep the terminal open and press Ctrl+C to stop.

For another port:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve-windows.ps1 -Port 8081
```

The Windows launcher now requires Node.js. The old standalone PowerShell static server cannot run React/TypeScript source directly.

## Build and check

```bash
npm test
npm run build
npm run preview
```

`npm run build` copies the local data, checks TypeScript and writes a static site to `dist/`. `npm run preview` serves that build at http://127.0.0.1:8080. `npm run typecheck` runs the type check on its own.

Optional Python production preview:

```bash
npm run build
python3 serve.py
python3 -m unittest -v test_serve.py
```

`serve.py` now serves **dist/** and explains how to build when no production bundle exists.

## Deploy to Vercel

Import the repository with its root as the project directory and use Node.js 22.x or newer. `vercel.json` sets:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

No Python server, database or environment variables are required for this version. This repository contains deployment configuration, not evidence of a completed deployment. The online basemap still requires internet access.

## Architecture

```text
src/
  App.tsx                 Shared view, layer, data and selected-road state
  components/
    Header.tsx            2D/3D controls
    LayerPanel.tsx        Statistics and the three layer switches
    MapView.tsx           MapLibre lifecycle, hover/click events and loading/errors
    RoadDetails.tsx       Road, speed-zone and observed traffic attributes
  map/layers.ts           GeoJSON sources, map paint styles and visibility
  domain/roads.ts          Lane interpretation and road display fields
  data/load.ts            Abortable data loading and basic boundary validation
  types.ts                Shared data and UI types
  styles.css              Existing visual design

data/                     Source GeoJSON and manifest, tracked in Git
scripts/fetch_data.py      Original Melbourne/OSM downloader
scripts/build_transport_snapshot.py  DTP speed/SCATS enrichment
scripts/prepare-data.mjs   Copy source data to public/data for Vite
public/data/              Generated copy, ignored by Git
dist/                     Production output, ignored by Git
```

React owns the UI state. MapLibre owns its canvas and layers. Switching views or toggling a layer updates the existing map instance. Unmounting removes map listeners, controls and workers. React renders road attributes as text instead of inserting HTML strings.

The migration retains the latest UI update: three layer groups, roads coloured
by estimated capacity load, hover/click road details, compact lane summary and
2D/3D camera transitions. The map library is installed through npm and its
version is locked. Source GeoJSON and the data download logic remain unchanged.

## What the demo shows

### Road selection

Hover over a road to preview its details. Click to lock a longer straight road
section and show its blue outline. The app joins connected OSM fragments with
the same name and direction model, following the straightest path. It stops
before a significant turn. Because OSM commonly changes lane tags at
intersections, the restriction choices use the mapped lane count on the exact
segment the user clicked while the selectable blue planning section can remain
long.
Hovering other roads does not replace the
selection. Click another segment to switch, or use **Clear selection** on the
map or in the details panel to return to hover previews. Zooming and changing
between 2D and 3D preserve the selection. The selection outline remains visible
when the road-context layer is hidden. Selection is temporary and resets on a
page reload; this step does not create construction restrictions.

### Custom work range

The left sidebar also supports address-based selection. Enter two street
addresses on the same road, such as **160 Victoria Street** and **170 Victoria
Street**, then choose **Locate work range**. Local City of Melbourne building
address points are interpolated along that street, snapped to the matching OSM
road section and shown automatically as A/B. The map zooms to the result. This
is a planning estimate rather than a cadastral or survey boundary, and an
out-of-scope or mismatched street produces an explicit error.

Select a road, then choose **Set work range**. Click near the blue line to
place **A**, then **B**; clicks snap to that selected section within 16 screen
pixels. The purple line follows the road between those points, and the length
is measured along the road in metres. Either click order is supported; A/B do
not imply a traffic direction. Points must be at least one metre apart.
Use **Move A / Move B** to replace one endpoint, or **Reset range** to clear
the range while retaining the selected road. **Cancel** keeps a complete range
when adjusting it and discards an unfinished initial range. While placing a
point, clicks only edit the selected road; cancel placement before switching
roads. Switching roads or clearing selection discards its range.

The range stays visible through zoom, 2D/3D and road-layer visibility changes.
It is temporary (cleared on reload), limited to one generated straight road
section, and stores
snapped coordinates and offsets separately from the original road geometry.
This defines the work extent only; it does not close roads or change traffic.

### Traffic restriction configuration

Below **Work range**, a complete range enables **Traffic restrictions**. The
dropdown is generated from the selected section's mapped lane count: keep all
lanes open, close 1 to N−1 of N lanes, or close all lanes. Partial closure is unavailable when
the mapped lane count is unknown or only one lane. Counts on two-way roads are
totals across both directions; directional restrictions are not implemented.
A temporary speed limit can accompany open lanes or a partial closure. Enter
a positive whole number, no higher than the mapped speed limit when available.
Full closure clears and hides lane-count and speed inputs.

The summary shows the range length and current configuration; incomplete or
invalid inputs are flagged rather than summarised as valid restrictions.
Moving endpoints preserves the settings. Resetting the range, switching roads,
clearing selection, or reloading the page clears them. These are draft settings
only; they do not yet affect traffic rendering or run a simulation.

- 2D planning view and 3D building-massing view.
- 2023 City of Melbourne building footprints extruded using supplied structure height.
- Public road and laneway corridor polygons.
- Roads recoloured from low load (green) to near/over modelled capacity (red).
- Development model footprints coloured by status.
- Compact road-details panel with lane count, direction, official speed limit,
  nearby observed traffic, surface and road class where available.
- A weekday/weekend selector with a 15-minute time slider that recolours roads
  by estimated capacity load rather than each road's own daily peak.
- Independent controls for building, development and road-context layers.

### Estimated capacity-load logic

Road colour now represents a modelled load, not a comparison with the same
road's own daily peak. At the selected 15-minute interval:

```text
modelled capacity = mapped lanes × 1,800 vehicles/hour/lane
                   × 50% effective green time × 0.25 hour
                   = mapped lanes × 225 vehicles/15 minutes

capacity load = observed SCATS vehicles/15 minutes ÷ modelled capacity × 100
```

The model uses a conservative default effective-green ratio of 50% because
site-specific signal phasing and timing are not yet ingested. Green means a low
share of the modelled capacity; yellow and orange show increasing load; red is
near or over the modelled capacity. This prevents a quiet large road from being
coloured red merely because its own historical peak was also low.

Traffic figures remain weekday or weekend averages from nearby September 2026
SCATS signal detectors. They are not a live feed and are not continuous counts
for the full selected road. Grey roads have no sufficiently close matching
SCATS observation or no mapped lane count, so no capacity load is fabricated.
The result is a screening estimate only—not a site-specific engineering
capacity assessment. Site configuration sheets can later replace the default
50% effective-green assumption with actual phasing and timing.

## Data scope and refresh

City datasets are filtered by their published geographic reference points within one kilometre of Queen Victoria Market (`144.9568, -37.8076`). OSM ways use the Overpass around filter. The blue circle marks the study area; features are not geometrically clipped to it.

```bash
python3 scripts/fetch_data.py
npm run prepare:data
```

The downloader continues to write to `data/`. Development startup and production builds automatically copy it to `public/data/`. If you refresh data while the dev server is running, run `npm run prepare:data` and reload the browser.

Only the current UI's manifest, study area, buildings, roads, road lanes and development footprints are loaded. Additional source datasets remain available for future work.

### Rebuild the transport snapshot

Download the latest official Speed Zones GeoJSON, Victorian Traffic Signals
CSV and Traffic Signal Volume ZIP. Then run:

```bash
python3 scripts/build_transport_snapshot.py \
  --speed-zones /path/to/speed_zones.geojson \
  --traffic-signals /path/to/victorian_traffic_signals.csv \
  --scats /path/to/traffic_signal_volume.zip
npm run prepare:data
```

The script spatially matches speed zones to the local OSM road lines. It only
attaches traffic to a road when a SCATS site is within 70 metres and shares a
street-name token. Unmatched speed and traffic values remain visibly unknown.

## Official sources

- [2023 Building Footprints](https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/information/)
- [Road Corridors](https://data.melbourne.vic.gov.au/explore/dataset/road-corridors/information/)
- [Development Model Footprints](https://data.melbourne.vic.gov.au/explore/dataset/development-activity-model-footprints/information/)
- [DTP Speed Zones](https://opendata.transport.vic.gov.au/dataset/speed-zones)
- [Victorian Traffic Signals](https://opendata.transport.vic.gov.au/dataset/victorian-traffic-signals)
- [DTP Traffic Signal Volume Data](https://opendata.transport.vic.gov.au/dataset/traffic-signal-volume-data)
- [DTP Traffic Signal Configuration Data Sheets](https://opendata.transport.vic.gov.au/dataset/traffic-signal-configuration-data-sheets)
- [OpenStreetMap lane tags](https://www.openstreetmap.org/copyright)

City of Melbourne datasets are used under their published open-data terms. Development polygons and heights are indicative, not survey-grade measurements. The City road-corridor data does not publish lane counts, so the demo overlays mapped OpenStreetMap tags. Missing values stay as `Not recorded`.

- On a one-way segment, a recorded total applies to the permitted travel direction.
- On a two-way segment, the total combines both directions.
- The current compact inspector does not show separate directional counts, though recorded values remain in the source data.
