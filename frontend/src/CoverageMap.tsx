import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import { heatLayer } from "@linkurious/leaflet-heat";
import "leaflet/dist/leaflet.css";

type CoverageMeasurement = {
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

/*
 * Automatically fits the map to all valid GPS points.
 */
function MapUpdater({
  measurements,
}: {
  measurements: CoverageMeasurement[];
}) {
  const map = useMap();

  useEffect(() => {
    const validPoints = measurements.filter(
      (point) =>
        typeof point.latitude === "number" &&
        typeof point.longitude === "number"
    );

    if (validPoints.length === 0) {
      return;
    }

    const bounds = L.latLngBounds(
      validPoints.map((point) => [
        point.latitude as number,
        point.longitude as number,
      ])
    );

    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 18,
    });
  }, [measurements, map]);

  return null;
}

/*
 * Convert RSSI to heatmap intensity.
 */
function getHeatIntensity(rssi: number | null) {
  if (rssi === null) {
    return 0.05;
  }

  if (rssi >= -50) {
    return 1.0;
  }

  if (rssi >= -60) {
    return 0.8;
  }

  if (rssi >= -70) {
    return 0.6;
  }

  if (rssi >= -80) {
    return 0.3;
  }

  if (rssi >= -90) {
    return 0.1;
  }

  return 0.05;
}

/*
 * Real RSSI heatmap.
 */
function RSSIHeatmap({
  measurements,
}: {
  measurements: CoverageMeasurement[];
}) {
  const map = useMap();

  useEffect(() => {
    const validPoints: Array<[number, number, number]> =
      measurements
        .filter(
          (point) =>
            typeof point.latitude === "number" &&
            typeof point.longitude === "number" &&
            typeof point.rssi_dbm === "number"
        )
        .map((point) => [
          point.latitude as number,
          point.longitude as number,
          getHeatIntensity(point.rssi_dbm),
        ]);

    if (validPoints.length === 0) {
      return;
    }

    const layer = heatLayer(validPoints, {
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

    return () => {
      map.removeLayer(layer);
    };
  }, [measurements, map]);

  return null;
}

/*
 * Individual marker color based on RSSI.
 */
function getSignalColor(rssi: number | null) {
  if (rssi === null) return "#8b93a7";

  if (rssi >= -50) return "#35d49a";

  if (rssi >= -60) return "#8bd450";

  if (rssi >= -70) return "#e7bd45";

  if (rssi >= -80) return "#ed8b45";

  return "#ef6262";
}

/*
 * Human-readable signal quality.
 */
function getSignalLabel(rssi: number | null) {
  if (rssi === null) return "Unknown";

  if (rssi >= -50) return "Excellent";

  if (rssi >= -60) return "Good";

  if (rssi >= -70) return "Fair";

  if (rssi >= -80) return "Weak";

  return "Very Weak";
}

/*
 * RSSI legend displayed inside the map.
 */
function SignalLegend() {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 1000,
        left: "12px",
        bottom: "12px",
        background: "rgba(15, 18, 25, 0.92)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "10px",
        padding: "12px 14px",
        minWidth: "190px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
        color: "#e8ebf2",
        fontSize: "12px",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "9px",
          color: "#aeb4c4",
        }}
      >
        Signal Strength
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "7px",
        }}
      >
        <LegendRow
          color="#35d49a"
          label="≥ -50 dBm"
          quality="Excellent"
        />

        <LegendRow
          color="#8bd450"
          label="-50 to -60 dBm"
          quality="Good"
        />

        <LegendRow
          color="#e7bd45"
          label="-60 to -70 dBm"
          quality="Fair"
        />

        <LegendRow
          color="#ed8b45"
          label="-70 to -80 dBm"
          quality="Weak"
        />

        <LegendRow
          color="#ef6262"
          label="< -80 dBm"
          quality="Very Weak"
        />
      </div>
    </div>
  );
}

/*
 * Single legend row.
 */
function LegendRow({
  color,
  label,
  quality,
}: {
  color: string;
  label: string;
  quality: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <span
        style={{
          width: "11px",
          height: "11px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          flexShrink: 0,
          boxShadow: `0 0 7px ${color}`,
        }}
      />

      <span
        style={{
          color: "#d9dde7",
          minWidth: "78px",
        }}
      >
        {label}
      </span>

      <span
        style={{
          color: "#8f96a8",
        }}
      >
        {quality}
      </span>
    </div>
  );
}

function CoverageMap({
  measurements,
}: CoverageMapProps) {
  /*
   * Only measurements containing real GPS
   * coordinates are displayed.
   */
  const validPoints = measurements.filter(
    (point) =>
      typeof point.latitude === "number" &&
      typeof point.longitude === "number"
  );

  /*
   * Existing empty state.
   */
  if (validPoints.length === 0) {
    return (
      <div className="coverage-empty">
        <h3>No location measurements yet</h3>

        <p>
          Collect a coverage point to display it on
          the map.
        </p>
      </div>
    );
  }

  const firstPoint = validPoints[0];

  return (
    <div
      style={{
        width: "100%",
        height: "520px",
        overflow: "hidden",
        borderRadius: "10px",
        position: "relative",
      }}
    >
      <MapContainer
        center={[
          firstPoint.latitude as number,
          firstPoint.longitude as number,
        ]}
        zoom={18}
        scrollWheelZoom={true}
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater measurements={measurements} />

        <RSSIHeatmap measurements={measurements} />

        {/* Individual measurement points */}
        {validPoints.map((point, index) => {
          const color = getSignalColor(
            point.rssi_dbm
          );

          return (
            <CircleMarker
              key={`${point.timestamp}-${index}`}
              center={[
                point.latitude as number,
                point.longitude as number,
              ]}
              radius={9}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 2,

                /*
                 * CSS animation hook.
                 */
                className: "coverage-map-marker",
              }}
            >
              <Popup>
                <div style={{ minWidth: "170px" }}>
                  <strong>
                    Coverage Point #{index + 1}
                  </strong>

                  <div
                    style={{
                      marginTop: "8px",
                    }}
                  >
                    <b>RSSI:</b>{" "}
                    {point.rssi_dbm ?? "--"} dBm
                  </div>

                  <div>
                    <b>Signal:</b>{" "}
                    {point.signal_percent ?? "--"}%
                  </div>

                  <div>
                    <b>Quality:</b>{" "}
                    {getSignalLabel(
                      point.rssi_dbm
                    )}
                  </div>

                  <div>
                    <b>Channel:</b>{" "}
                    {point.channel ?? "--"}
                  </div>

                  <div>
                    <b>Band:</b>{" "}
                    {point.band ?? "--"}
                  </div>

                  <div>
                    <b>Accuracy:</b>{" "}
                    {point.accuracy_m != null
                      ? `${point.accuracy_m.toFixed(
                          1
                        )} m`
                      : "--"}
                  </div>

                  <div>
                    <b>Time:</b>{" "}
                    {new Date(
                      point.timestamp
                    ).toLocaleTimeString()}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <SignalLegend />
    </div>
  );
}

export default CoverageMap;