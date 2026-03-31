import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MBTILES_PATH = path.join(__dirname, "public", "kesan.mbtiles");
const TILE_ROUTE = /^\/api\/mbtiles\/(\d+)\/(\d+)\/(\d+)$/;

function getContentType(format) {
  switch (format) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function tileToLngLat(x, y, z) {
  const scale = 2 ** z;
  const longitude = (x / scale) * 360 - 180;
  const latitude =
    (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale)));

  return [longitude, latitude];
}

function createMbtilesRuntimePlugin() {
  let database;
  let tileStatement;
  let metadataStatement;
  let metadataCache;

  function ensureDatabase() {
    if (database) {
      return;
    }

    database = new DatabaseSync(MBTILES_PATH, { readOnly: true });
    tileStatement = database.prepare(`
      SELECT tile_data
      FROM tiles
      WHERE zoom_level = ?
        AND tile_column = ?
        AND tile_row = ?
      LIMIT 1
    `);
    metadataStatement = database.prepare(`
      SELECT value
      FROM metadata
      WHERE name = ?
      LIMIT 1
    `);
  }

  function getMetadataValue(name) {
    ensureDatabase();
    return metadataStatement.get(name)?.value ?? null;
  }

  function getRuntimeMetadata() {
    if (metadataCache) {
      return metadataCache;
    }

    ensureDatabase();

    const zoomSummary = database
      .prepare(`
        SELECT
          MIN(zoom_level) AS minZoom,
          MAX(zoom_level) AS maxZoom
        FROM tiles
      `)
      .get();

    const tileExtent = database
      .prepare(`
        SELECT
          MIN(tile_column) AS minColumn,
          MAX(tile_column) AS maxColumn,
          MIN(tile_row) AS minRow,
          MAX(tile_row) AS maxRow
        FROM tiles
        WHERE zoom_level = ?
      `)
      .get(zoomSummary.maxZoom);

    const xyzMinY = 2 ** zoomSummary.maxZoom - 1 - tileExtent.maxRow;
    const xyzMaxY = 2 ** zoomSummary.maxZoom - 1 - tileExtent.minRow;

    const northWest = tileToLngLat(
      tileExtent.minColumn,
      xyzMinY,
      zoomSummary.maxZoom
    );
    const southEast = tileToLngLat(
      tileExtent.maxColumn + 1,
      xyzMaxY + 1,
      zoomSummary.maxZoom
    );

    metadataCache = {
      attribution: getMetadataValue("attribution") ?? "",
      bounds: [northWest[0], southEast[1], southEast[0], northWest[1]],
      center: [
        Number(((northWest[0] + southEast[0]) / 2).toFixed(6)),
        Number(((northWest[1] + southEast[1]) / 2).toFixed(6)),
      ],
      description: getMetadataValue("description") ?? "",
      format: (getMetadataValue("format") ?? "png").toLowerCase(),
      maxZoom: Number(getMetadataValue("maxzoom") ?? zoomSummary.maxZoom ?? 18),
      minZoom: Number(getMetadataValue("minzoom") ?? zoomSummary.minZoom ?? 0),
      name: getMetadataValue("name") ?? "MBTiles Layer",
      scheme: (getMetadataValue("scheme") ?? "tms").toLowerCase(),
      tileUrlTemplate: "/api/mbtiles/{z}/{x}/{y}",
    };

    return metadataCache;
  }

  function handleRequest(req, res, next) {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/api/mbtiles/metadata") {
      try {
        const metadata = getRuntimeMetadata();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(metadata));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            error: "MBTiles metadata okunamadi.",
            details: error instanceof Error ? error.message : String(error),
          })
        );
      }
      return;
    }

    const match = TILE_ROUTE.exec(requestUrl.pathname);
    if (!match) {
      next();
      return;
    }

    try {
      const [, zParam, xParam, yParam] = match;
      const zoom = Number(zParam);
      const column = Number(xParam);
      const xyzRow = Number(yParam);
      const tileRow = 2 ** zoom - xyzRow - 1;
      const metadata = getRuntimeMetadata();
      const tile = tileStatement.get(zoom, column, tileRow);

      if (!tile?.tile_data) {
        res.statusCode = 404;
        res.end();
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", getContentType(metadata.format));
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(tile.tile_data);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: "MBTiles tile okunamadi.",
          details: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  return {
    name: "mbtiles-runtime",
    configureServer(server) {
      server.middlewares.use(handleRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleRequest);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), createMbtilesRuntimePlugin()],
});
