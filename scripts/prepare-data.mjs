import { cp, mkdir } from "node:fs/promises";

// data/ remains the source of truth for the Python downloader and the team.
const source = new URL("../data/", import.meta.url);
const destination = new URL("../public/data/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log("Local map data copied to public/data.");
