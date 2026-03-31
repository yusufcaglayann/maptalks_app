import { useEffect, useRef, useState } from "react";
import * as maptalks from "maptalks";
import "./App.css";

const TILE_SOURCE = {
  initialZoom: 14,
  metadataUrl: "/api/mbtiles/metadata",
};

function App() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadMetadata() {
      try {
        const response = await fetch(TILE_SOURCE.metadataUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!isCancelled) {
          setMetadata(data);
          setError("");
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "MBTiles metadata okunamadi."
          );
        }
      }
    }

    loadMetadata();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!metadata || !mapRef.current) {
      return undefined;
    }

    const initialZoom = Math.min(
      metadata.maxZoom,
      Math.max(metadata.minZoom, TILE_SOURCE.initialZoom)
    );

    const map = new maptalks.Map(mapRef.current, {
      center: metadata.center,
      zoom: initialZoom,
      minZoom: metadata.minZoom,
      maxZoom: metadata.maxZoom,
      baseLayer: new maptalks.TileLayer("base", {
        urlTemplate: metadata.tileUrlTemplate,
        tileSize: [256, 256],
        maxAvailableZoom: metadata.maxZoom,
        repeatWorld: false,
        attribution:
          metadata.attribution ||
          "Tiles are streamed from kesan.mbtiles via the Vite runtime.",
      }),
    });

    mapInstanceRef.current = map;

    const layer = new maptalks.VectorLayer("vector").addTo(map);

    new maptalks.Marker(metadata.center, {
      symbol: {
        markerType: "ellipse",
        markerFill: "#0f89ff",
        markerLineColor: "#fff",
        markerLineWidth: 2,
        markerWidth: 20,
        markerHeight: 20,
      },
    }).addTo(layer);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [metadata]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Maptalks + Runtime MBTiles</h1>
        <p>
          Harita istekleri <code>/api/mbtiles/{"{z}"}/{"{x}"}/{"{y}"}</code>{" "}
          seklinde gidiyor.
        </p>
        <p>
          Vite middleware, <code>kesan.mbtiles</code> icindeki SQLite verisini
          okuyup tarayiciya dogrudan tile olarak donuyor.
        </p>
        {error ? <p className="app__status app__status--error">{error}</p> : null}
        {!metadata && !error ? (
          <p className="app__status">MBTiles metadata yukleniyor...</p>
        ) : null}
      </header>
      <div ref={mapRef} className="map" />
    </div>
  );
}

export default App;
