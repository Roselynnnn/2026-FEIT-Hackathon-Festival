import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadMapData, validateDataset } from "./load";

test("checked-in datasets still match the manifest after migration", async () => {
  const root = new URL("../../data/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", root), "utf8"),
  );
  validateDataset("manifest", manifest);
  for (const name of [
    "study_area",
    "roads",
    "road_lanes",
    "buildings",
    "developments",
  ] as const) {
    const data = JSON.parse(
      await readFile(new URL(`${name}.geojson`, root), "utf8"),
    );
    validateDataset(name, data);
    if (name !== "study_area")
      assert.equal(data.features.length, manifest.datasets[name].features);
  }
});

test("invalid JSON structures fail with the responsible dataset name", () => {
  assert.throws(
    () => validateDataset("roads", { type: "Feature", geometry: null }),
    /roads: invalid GeoJSON/,
  );
  assert.throws(() => validateDataset("manifest", {}), /manifest: invalid/);
});

test("a missing data file reports its HTTP failure instead of partially loading", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("missing", { status: 404 }),
  );
  await assert.rejects(
    loadMapData(new AbortController().signal, "/"),
    /manifest: HTTP 404/,
  );
});

test("cancelling data loading reaches all outstanding requests", async (context) => {
  const controller = new AbortController();
  controller.abort();
  context.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      assert.equal(options.signal, controller.signal);
      options.signal?.throwIfAborted();
      return new Response("{}");
    },
  );
  await assert.rejects(loadMapData(controller.signal, "/"), {
    name: "AbortError",
  });
});
