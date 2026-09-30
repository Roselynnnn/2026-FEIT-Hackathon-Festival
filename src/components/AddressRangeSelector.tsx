import { useState, type FormEvent } from "react";
import type { MapData, RoadFeature } from "../types";
import type { WorkRange } from "../domain/workRange";
import { planAddressRange } from "../domain/addressRange";

export function AddressRangeSelector({
  data,
  onSelect,
  compact = false,
}: {
  data: MapData | null;
  onSelect: (road: RoadFeature, range: WorkRange) => void;
  compact?: boolean;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    try {
      const plan = planAddressRange(
        from,
        to,
        data.building_info.features,
        data.road_lanes.features,
      );
      onSelect(plan.road, plan.range);
      setMessage(
        `Selected ${plan.fromLabel} to ${plan.toLabel} · ${Math.round(Math.abs(plan.range.end!.distance - plan.range.start!.distance))} m`,
      );
      setError(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
      setError(true);
    }
  }

  return (
    <form
      className={`address-range${compact ? " compact" : ""}`}
      onSubmit={submit}
    >
      {!compact && <h3>Select by address</h3>}
      <p>
        Use this only when you need an exact street-address range. The system
        snaps both addresses to the mapped road.
      </p>
      <label htmlFor="address-from">From</label>
      <input
        id="address-from"
        value={from}
        onChange={(event) => setFrom(event.target.value)}
        placeholder="e.g. 160 Victoria Street"
        autoComplete="off"
      />
      <label htmlFor="address-to">To</label>
      <input
        id="address-to"
        value={to}
        onChange={(event) => setTo(event.target.value)}
        placeholder="e.g. 170 Victoria Street"
        autoComplete="off"
      />
      <button type="submit" disabled={!data || !from.trim() || !to.trim()}>
        Set work range from addresses
      </button>
      {message && (
        <p
          className={error ? "address-error" : "address-success"}
          role="status"
        >
          {message}
        </p>
      )}
      <small>
        Source: City of Melbourne building addresses; positions are planning
        estimates.
      </small>
    </form>
  );
}
