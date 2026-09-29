# QVM Works Digital Twin

A React + TypeScript + Vite application showing the urban context around Queen Victoria Market, Melbourne, within a one-kilometre study area. MapLibre renders the 2D map and 3D building massing.

This is currently a map exploration prototype. Construction objects, traffic simulation and plan optimisation are not implemented yet.

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
    RoadDetails.tsx       Selected road attributes
  map/layers.ts           GeoJSON sources, map paint styles and visibility
  domain/roads.ts          Lane interpretation and road display fields
  data/load.ts            Abortable data loading and basic boundary validation
  types.ts                Shared data and UI types
  styles.css              Existing visual design

data/                     Source GeoJSON and manifest, tracked in Git
scripts/fetch_data.py      Original Melbourne/OSM downloader
scripts/prepare-data.mjs   Copy source data to public/data for Vite
public/data/              Generated copy, ignored by Git
dist/                     Production output, ignored by Git
```

React owns the UI state. MapLibre owns its canvas and layers. Switching views or toggling a layer updates the existing map instance. Unmounting removes map listeners, controls and workers. React renders road attributes as text instead of inserting HTML strings.

The migration retains the latest UI update: three layer groups, uniform blue roads, hover/click road details, compact lane summary and 2D/3D camera transitions. The map library is installed through npm and its version is locked. Source GeoJSON and the data download logic remain unchanged.

## What the demo shows

- 2D planning view and 3D building-massing view.
- 2023 City of Melbourne building footprints extruded using supplied structure height.
- Public road and laneway corridor polygons.
- Uniform blue roads with recorded lane counts shown when hovered or clicked.
- Development model footprints coloured by status.
- Compact road-details panel with lane count, direction, speed limit, surface and road class where available.
- Independent controls for building, development and road-context layers.

Road colours do not represent traffic conditions. The data is a snapshot, not a live traffic feed.

## Data scope and refresh

City datasets are filtered by their published geographic reference points within one kilometre of Queen Victoria Market (`144.9568, -37.8076`). OSM ways use the Overpass around filter. The blue circle marks the study area; features are not geometrically clipped to it.

```bash
python3 scripts/fetch_data.py
npm run prepare:data
```

The downloader continues to write to `data/`. Development startup and production builds automatically copy it to `public/data/`. If you refresh data while the dev server is running, run `npm run prepare:data` and reload the browser.

Only the current UI's manifest, study area, buildings, roads, road lanes and development footprints are loaded. Additional source datasets remain available for future work.

## Official sources

- [2023 Building Footprints](https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/information/)
- [Road Corridors](https://data.melbourne.vic.gov.au/explore/dataset/road-corridors/information/)
- [Development Model Footprints](https://data.melbourne.vic.gov.au/explore/dataset/development-activity-model-footprints/information/)
- [OpenStreetMap lane tags](https://www.openstreetmap.org/copyright)

City of Melbourne datasets are used under their published open-data terms. Development polygons and heights are indicative, not survey-grade measurements. The City road-corridor data does not publish lane counts, so the demo overlays mapped OpenStreetMap tags. Missing values stay as `Not recorded`.

- On a one-way segment, a recorded total applies to the permitted travel direction.
- On a two-way segment, the total combines both directions.
- The current compact inspector does not show separate directional counts, though recorded values remain in the source data.
