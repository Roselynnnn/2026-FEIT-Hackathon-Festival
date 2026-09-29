import { useMemo } from "react";
import type { LayerId, LayerVisibility, MapData } from "../types";
import type { RoadSelectionAction } from "../domain/selection";
import { AddressRangeSelector } from "./AddressRangeSelector";

const layerOptions: {
  id: LayerId;
  title: string;
  caption: string;
  color: string;
}[] = [
  {
    id: "buildings",
    title: "Existing buildings",
    caption: "2023 footprints + height",
    color: "#93a8b2",
  },
  {
    id: "developments",
    title: "Development models",
    caption: "Applied to completed",
    color: "#e78028",
  },
  {
    id: "roads",
    title: "Road corridors",
    caption: "Colour: estimated capacity load",
    color: "#2c6eeb",
  },
];

export function LayerPanel({
  data,
  layers,
  onToggle,
  onRangeAction,
}: {
  data: MapData | null;
  layers: LayerVisibility;
  onToggle: (layer: LayerId, enabled: boolean) => void;
  onRangeAction: (action: RoadSelectionAction) => void;
}) {
  const height = useMemo(
    () =>
      data?.buildings.features.reduce(
        (max, feature) => Math.max(max, Number(feature.properties.height) || 0),
        0,
      ),
    [data],
  );
  const stats = [
    [
      "buildingCount",
      "Building footprints",
      data?.buildings.features.length.toLocaleString(),
    ],
    [
      "roadCount",
      "Road corridors",
      data?.roads.features.length.toLocaleString(),
    ],
    [
      "devCount",
      "Development models",
      data?.developments.features.length.toLocaleString(),
    ],
    [
      "heightMax",
      "Maximum mapped height",
      height == null ? undefined : `${Math.round(height)} m`,
    ],
  ];
  return (
    <aside className="sidebar">
      <h2>Urban context</h2>
      <div className="caption">
        Explore the road, building and development conditions surrounding the
        market.
      </div>
      <div className="study-card">
        <strong>Queen Victoria Market</strong>
        <span>
          Officially bounded by Peel, Franklin, Victoria and Elizabeth Streets
        </span>
      </div>
      <AddressRangeSelector
        data={data}
        onSelect={(road, range) =>
          onRangeAction({ type: "select-range", road, range })
        }
      />
      <div className="stats">
        {stats.map(([id, label, value]) => (
          <div className="stat" key={id}>
            <b id={id}>{value ?? "—"}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <h3>Map layers</h3>
      {layerOptions.map((layer) => (
        <div className="layer" key={layer.id}>
          <div className="layer-info">
            <i className="swatch" style={{ background: layer.color }} />
            <div>
              <b>{layer.title}</b>
              <small>{layer.caption}</small>
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              aria-label={layer.title}
              data-layer={layer.id}
              checked={layers[layer.id]}
              onChange={(event) => onToggle(layer.id, event.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>
      ))}
      <h3>Development status</h3>
      <div className="status-row">
        <span className="badge" style={{ background: "#fff0c9" }}>
          Applied
        </span>
        <span className="badge" style={{ background: "#eadfff" }}>
          Approved
        </span>
        <span className="badge" style={{ background: "#ffd9c7" }}>
          Under construction
        </span>
        <span className="badge" style={{ background: "#d7eee5" }}>
          Complete
        </span>
      </div>
    </aside>
  );
}
