import { useEffect, useRef } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { heatLayer } from "@linkurious/leaflet-heat";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type CoverageMeasurement = {
  timestamp: string;
  ssid: string | null;
  bssid: string | null;
  signal_percent: number | null;
  rssi_dbm: number | null;
  channel: number | null;
  band: string | null;
  receive_rate_mbps: number | null;
  transmit_rate_mbps: number | null;
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
};

type CoverageMapProps = {
  measurements: CoverageMeasurement[];
};

function getMarkerColor(rssi: number | null) {
  if (rssi == null) return "#8b93a7";
  if (rssi >= -50) return "#35d49a";
  if (rssi >= -60) return "#8bd450";
  if (rssi >= -70) return "#e7bd45";
  if (rssi >= -80) return "#ed8b45";
  return "#ef6262";
}

function getHeatIntensity(rssi: number | null) {
  if (rssi == null) return 0.05;
  if (rssi >= -50) return 1;
  if (rssi >= -60) return 0.8;
  if (rssi >= -70) return 0.6;
  if (rssi >= -80) return 0.3;
  if (rssi >= -90) return 0.1;
  return 0.05;
}

function MapUpdater({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 18);
      return;
    }

    map.fitBounds(L.latLngBounds(points), {
      padding: [40, 40],
      maxZoom: 19,
    });
  }, [map, points]);

  return null;
}

function CoverageHeatLayer({
  points,
}: {
  points: [number, number, number][];
}) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (points.length === 0) return;

    const layer = heatLayer(points, {
      radius: 35,
      blur: 25,
      maxZoom: 20,
      max: 1,
      minOpacity: 0.35,
      gradient: {
        0.1: "#ef6262",
        0.3: "#ed8b45",
        0.5: "#e7bd45",
        0.7: "#8bd450",
        1.0: "#35d49a",
      },
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

function CoverageMap({ measurements }: CoverageMapProps) {
  const validMeasurements = measurements.filter(
    (point) =>
      typeof point.latitude === "number" &&
      typeof point.longitude === "number"
  );

  const points: [number, number][] = validMeasurements.map((point) => [
    point.latitude as number,
    point.longitude as number,
  ]);

  const heatPoints: [number, number, number][] = validMeasurements.map(
    (point) => [
      point.latitude as number,
      point.longitude as number,
      getHeatIntensity(point.rssi_dbm),
    ]
  );

  const latestTimestamp =
    validMeasurements.length > 0
      ? validMeasurements[validMeasurements.length - 1].timestamp
      : null;

  const center: [number, number] =
    points.length > 0 ? points[points.length - 1] : [20.5937, 78.9629];

  return (
    <div className="coverage-map">
      {validMeasurements.length === 0 ? (
        <div className="coverage-map-empty">
          <div>
            <strong>No GPS measurements yet</strong>
            <span>Collect a point or start a survey to build the coverage map.</span>
          </div>
        </div>
      ) : (
        <>
          <MapContainer
            center={center}
            zoom={18}
            scrollWheelZoom={true}
            style={{ width: "100%", height: "520px" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapUpdater points={points} />
            <CoverageHeatLayer points={heatPoints} />

            {validMeasurements.map((point, index) => {
              const latitude = point.latitude as number;
              const longitude = point.longitude as number;
              const isLatest =
                latestTimestamp === point.timestamp &&
                index === validMeasurements.length - 1;
              const color = getMarkerColor(point.rssi_dbm);

              return (
                <CircleMarker
                  key={`${point.timestamp}-${index}`}
                  center={[latitude, longitude]}
                  radius={isLatest ? 8 : 6}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.9,
                    weight: isLatest ? 3 : 2,
                  }}
                >
                  <Popup>
                    <strong>Wi-Fi Measurement</strong>
                    <br />
                    RSSI: {point.rssi_dbm ?? "--"} dBm
                    <br />
                    Signal: {point.signal_percent ?? "--"}%
                    <br />
                    Quality: {getQuality(point.rssi_dbm)}
                    <br />
                    Channel: {point.channel ?? "--"}
                    <br />
                    Band: {point.band ?? "--"}
                    <br />
                    GPS accuracy: {point.accuracy_m != null ? `${point.accuracy_m.toFixed(1)} m` : "--"}
                    <br />
                    Time: {new Date(point.timestamp).toLocaleString()}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          <div className="coverage-map-legend">
            <div className="coverage-legend-title">Signal</div>
            <div><span style={{ background: "#35d49a" }} /> Excellent ≥ -50 dBm</div>
            <div><span style={{ background: "#8bd450" }} /> Good -50 to -60 dBm</div>
            <div><span style={{ background: "#e7bd45" }} /> Fair -60 to -70 dBm</div>
            <div><span style={{ background: "#ed8b45" }} /> Weak -70 to -80 dBm</div>
            <div><span style={{ background: "#ef6262" }} /> Very Weak &lt; -80 dBm</div>
          </div>
        </>
      )}
    </div>
  );
}

function getQuality(rssi: number | null) {
  if (rssi == null) return "Unknown";
  if (rssi >= -50) return "Excellent";
  if (rssi >= -60) return "Good";
  if (rssi >= -70) return "Fair";
  if (rssi >= -80) return "Weak";
  return "Very Weak";
}

export default CoverageMap;
