import { useEffect, useRef } from "react";
import * as maptalks from "maptalks";
import "./App.css";

function App() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new maptalks.Map(mapRef.current, {
        center: [29.0, 41.0], // İstanbul civarı
        zoom: 10,
        baseLayer: new maptalks.TileLayer("base", {
          urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          subdomains: ["a", "b", "c"],
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }),
      });

      const layer = new maptalks.VectorLayer("vector").addTo(
        mapInstanceRef.current
      );

      new maptalks.Marker([29.0, 41.0], {
        symbol: {
          markerType: "ellipse",
          markerFill: "#0f89ff",
          markerLineColor: "#fff",
          markerLineWidth: 2,
          markerWidth: 20,
          markerHeight: 20,
        },
      }).addTo(layer);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="app">
      <h1>Maptalks + React + Vite</h1>
      <div ref={mapRef} className="map" />
    </div>
  );
}

export default App;