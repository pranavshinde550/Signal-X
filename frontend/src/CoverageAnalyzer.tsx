import { useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Wifi,
  Trash2,
  Signal,
  Play,
  Square,
} from "lucide-react";
import CoverageMap from "./CoverageMap";
import "./CoverageAnalyzer.css";
import { Capacitor } from "@capacitor/core";
import { WifiInfo } from "./nativeWifi";
import { SIGNALX_API_BASE } from "./signalxConfig";

type Measurement = {
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

type CoverageResponse = {
  success: boolean;
  count: number;
  measurements: Measurement[];
  error: string | null;
};

type WifiCurrentResponse = {
  connected: boolean;
  ssid: string | null;
  bssid: string | null;
  signal_percent: number | null;
  rssi_dbm: number | null;
  channel: number | null;
  band: string | null;
  receive_rate_mbps: number | null;
  transmit_rate_mbps: number | null;
  error?: string | null;
};

const ANDROID_COVERAGE_STORAGE_KEY =
  "signalx_coverage_measurements";

function CoverageAnalyzer() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(false);
  const [surveyRunning, setSurveyRunning] = useState(false);
  const [surveyStatus, setSurveyStatus] =
    useState("Survey stopped");

  const surveyTimerRef = useRef<number | null>(null);
  const collectingRef = useRef(false);

  const lastSurveyPointRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const API_BASE = SIGNALX_API_BASE;
  const isAndroid = Capacitor.getPlatform() === "android";

  const MIN_SURVEY_DISTANCE_METERS = 3;

  const calculateDistanceMeters = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const earthRadius = 6371000;

    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const deltaLat =
      ((lat2 - lat1) * Math.PI) / 180;

    const deltaLon =
      ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaLat / 2) *
        Math.sin(deltaLat / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return earthRadius * c;
  };

  const loadMeasurements = async () => {
    try {
      if (isAndroid) {
        const stored =
          window.localStorage.getItem(
            ANDROID_COVERAGE_STORAGE_KEY
          );

        if (!stored) {
          setMeasurements([]);
          return;
        }

        try {
          const parsed = JSON.parse(stored);

          if (Array.isArray(parsed)) {
            setMeasurements(parsed);
          } else {
            setMeasurements([]);
          }
        } catch (error) {
          console.error(
            "Failed to parse Android coverage measurements:",
            error
          );

          setMeasurements([]);
        }

        return;
      }

      const response = await fetch(
        `${API_BASE}/api/wifi/coverage`
      );

      if (!response.ok) {
        throw new Error(
          `Coverage request failed: ${response.status}`
        );
      }

      const data: CoverageResponse =
        await response.json();

      if (data.success) {
        setMeasurements(data.measurements || []);
      }
    } catch (error) {
      console.error(
        "Failed to load coverage measurements:",
        error
      );
    }
  };

  const collectMeasurement = async (
    fromSurvey = false
  ) => {
    if (collectingRef.current) {
      return;
    }

    collectingRef.current = true;

    if (fromSurvey) {
      setSurveyStatus(
        "Collecting measurement..."
      );
    } else {
      setLoading(true);
    }

    try {
      let latitude: number;
      let longitude: number;
      let accuracy: number;

      if (isAndroid) {
        /*
         * Android uses the native location bridge instead of
         * navigator.geolocation. This avoids WebView fetch/location
         * failures and works with Android's approximate-location mode.
         */
        const nativeLocation =
          await WifiInfo.getCurrentLocation();

        latitude = nativeLocation.latitude;
        longitude = nativeLocation.longitude;
        accuracy = nativeLocation.accuracy_m;
      } else {
        if (!navigator.geolocation) {
          throw new Error(
            "Geolocation is not supported by this browser."
          );
        }

        const position =
          await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                  enableHighAccuracy: true,
                  timeout: 10000,
                  maximumAge: 0,
                }
              );
            }
          );

        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        accuracy = position.coords.accuracy;
      }

      let wifi: WifiCurrentResponse;

      if (isAndroid) {
        const nativeWifi =
          await WifiInfo.getCurrentWifi();

        wifi = {
          connected: nativeWifi.connected,
          ssid: nativeWifi.ssid ?? null,
          bssid: nativeWifi.bssid ?? null,
          signal_percent:
            nativeWifi.signal_percent ?? null,
          rssi_dbm:
            nativeWifi.rssi_dbm ?? null,
          channel:
            nativeWifi.channel ?? null,
          band:
            nativeWifi.band ?? null,
          receive_rate_mbps:
            nativeWifi.receive_rate_mbps ?? null,
          transmit_rate_mbps:
            nativeWifi.transmit_rate_mbps ?? null,
          error:
            nativeWifi.message ?? null,
        };
      } else {
        const wifiResponse = await fetch(
          `${API_BASE}/api/wifi/current`
        );

        if (!wifiResponse.ok) {
          throw new Error(
            `Wi-Fi request failed: ${wifiResponse.status}`
          );
        }

        wifi =
          await wifiResponse.json();
      }

      if (!wifi.connected) {
        throw new Error(
          wifi.error ||
            "No active Wi-Fi connection."
        );
      }

      if (fromSurvey) {
        const lastPoint =
          lastSurveyPointRef.current;

        if (lastPoint) {
          const distance =
            calculateDistanceMeters(
              lastPoint.latitude,
              lastPoint.longitude,
              latitude,
              longitude
            );

          if (
            distance <
            MIN_SURVEY_DISTANCE_METERS
          ) {
            setSurveyStatus(
              `Waiting for movement • ${distance.toFixed(
                1
              )} m / ${MIN_SURVEY_DISTANCE_METERS} m`
            );

            return;
          }
        }
      }

      const measurement: Measurement = {
        timestamp: new Date().toISOString(),

        ssid: wifi.ssid,
        bssid: wifi.bssid,

        signal_percent:
          wifi.signal_percent,

        rssi_dbm: wifi.rssi_dbm,

        channel: wifi.channel,
        band: wifi.band,

        receive_rate_mbps:
          wifi.receive_rate_mbps,

        transmit_rate_mbps:
          wifi.transmit_rate_mbps,

        latitude,
        longitude,
        accuracy_m: accuracy,
      };

      if (isAndroid) {
        const existing =
          window.localStorage.getItem(
            ANDROID_COVERAGE_STORAGE_KEY
          );

        let storedMeasurements: Measurement[] = [];

        if (existing) {
          try {
            const parsed = JSON.parse(existing);

            if (Array.isArray(parsed)) {
              storedMeasurements = parsed;
            }
          } catch {
            storedMeasurements = [];
          }
        }

        const updatedMeasurements = [
          ...storedMeasurements,
          measurement,
        ].slice(-500);

        window.localStorage.setItem(
          ANDROID_COVERAGE_STORAGE_KEY,
          JSON.stringify(updatedMeasurements)
        );

        setMeasurements(updatedMeasurements);
      } else {
        const saveResponse = await fetch(
          `${API_BASE}/api/wifi/coverage/point`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(measurement),
          }
        );

        if (!saveResponse.ok) {
          throw new Error(
            `Save request failed: ${saveResponse.status}`
          );
        }

        const savedData =
          await saveResponse.json();

        if (!savedData.success) {
          throw new Error(
            savedData.error ||
              "Failed to save coverage measurement."
          );
        }

        await loadMeasurements();
      }

      if (fromSurvey) {
        lastSurveyPointRef.current = {
          latitude,
          longitude,
        };
      }

      if (fromSurvey) {
        setSurveyStatus(
          `Point saved • RSSI ${
            measurement.rssi_dbm ?? "--"
          } dBm • GPS accuracy ${
            measurement.accuracy_m != null
              ? `${measurement.accuracy_m.toFixed(
                  1
                )} m`
              : "--"
          }`
        );
      }
    } catch (error) {
      console.error(
        "Coverage measurement failed:",
        error
      );

      if (fromSurvey) {
        setSurveyStatus(
          error instanceof Error
            ? error.message
            : "Measurement failed"
        );
      } else {
        alert(
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Failed to collect coverage point."
        );
      }
    } finally {
      collectingRef.current = false;
      setLoading(false);
    }
  };

  const startSurvey = async () => {
    if (surveyRunning) {
      return;
    }

    lastSurveyPointRef.current = null;

    setSurveyRunning(true);
    setSurveyStatus("Starting survey...");

    await collectMeasurement(true);

    surveyTimerRef.current =
      window.setInterval(() => {
        collectMeasurement(true);
      }, 3000);

    setSurveyStatus(
      "Survey running • minimum 3 m movement • GPS accuracy ≤ 20 m"
    );
  };

  const stopSurvey = () => {
    if (surveyTimerRef.current !== null) {
      window.clearInterval(
        surveyTimerRef.current
      );

      surveyTimerRef.current = null;
    }

    setSurveyRunning(false);
    setSurveyStatus("Survey stopped");

    lastSurveyPointRef.current = null;
  };

  const clearMeasurements = async () => {
    if (surveyRunning) {
      stopSurvey();
    }

    const confirmed = window.confirm(
      "Clear all coverage measurements?"
    );

    if (!confirmed) {
      return;
    }

    try {
      if (isAndroid) {
        window.localStorage.removeItem(
          ANDROID_COVERAGE_STORAGE_KEY
        );

        setMeasurements([]);

        setSurveyStatus(
          "All measurements cleared"
        );

        return;
      }

      const response = await fetch(
        `${API_BASE}/api/wifi/coverage`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Clear request failed: ${response.status}`
        );
      }

      await loadMeasurements();

      setSurveyStatus(
        "All measurements cleared"
      );
    } catch (error) {
      console.error(
        "Failed to clear measurements:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to clear measurements."
      );
    }
  };

  useEffect(() => {
    loadMeasurements();

    return () => {
      if (surveyTimerRef.current !== null) {
        window.clearInterval(
          surveyTimerRef.current
        );

        surveyTimerRef.current = null;
      }

      collectingRef.current = false;
      lastSurveyPointRef.current = null;
    };
  }, []);

  const latestMeasurement =
    measurements.length > 0
      ? measurements[measurements.length - 1]
      : null;

  /*
   * ==========================================
   * COVERAGE STATISTICS
   * ==========================================
   */

  const validRssiValues = measurements
    .map((point) => point.rssi_dbm)
    .filter(
      (value): value is number =>
        typeof value === "number"
    );

  const validSignalValues = measurements
    .map((point) => point.signal_percent)
    .filter(
      (value): value is number =>
        typeof value === "number"
    );

  const validLocationPoints = measurements.filter(
    (point) =>
      typeof point.latitude === "number" &&
      typeof point.longitude === "number"
  );

  const averageRssi =
    validRssiValues.length > 0
      ? validRssiValues.reduce(
          (sum, value) => sum + value,
          0
        ) / validRssiValues.length
      : null;

  const strongestRssi =
    validRssiValues.length > 0
      ? Math.max(...validRssiValues)
      : null;

  const weakestRssi =
    validRssiValues.length > 0
      ? Math.min(...validRssiValues)
      : null;

  const averageSignal =
    validSignalValues.length > 0
      ? validSignalValues.reduce(
          (sum, value) => sum + value,
          0
        ) / validSignalValues.length
      : null;

  /*
   * Overall coverage classification.
   *
   * Based on average RSSI, not the strongest
   * or weakest individual measurement.
   */
  const getCoverageQuality = (
    rssi: number | null
  ) => {
    if (rssi === null) {
      return {
        label: "No Data",
        description:
          "Collect measurements to determine coverage quality.",
        color: "#8b93a7",
      };
    }

    if (rssi >= -50) {
      return {
        label: "Excellent",
        description:
          "The surveyed area has very strong average Wi-Fi signal.",
        color: "#35d49a",
      };
    }

    if (rssi >= -60) {
      return {
        label: "Good",
        description:
          "The surveyed area has strong average Wi-Fi signal.",
        color: "#8bd450",
      };
    }

    if (rssi >= -70) {
      return {
        label: "Fair",
        description:
          "The surveyed area has moderate average Wi-Fi signal.",
        color: "#e7bd45",
      };
    }

    if (rssi >= -80) {
      return {
        label: "Weak",
        description:
          "The surveyed area has weak average Wi-Fi signal.",
        color: "#ed8b45",
      };
    }

    return {
      label: "Very Weak",
      description:
        "The surveyed area has very weak average Wi-Fi signal.",
      color: "#ef6262",
    };
  };

  const coverageQuality =
    getCoverageQuality(averageRssi);

  /*
   * Signal distribution.
   */
  const signalDistribution = {
    excellent: 0,
    good: 0,
    fair: 0,
    weak: 0,
    veryWeak: 0,
  };

  validRssiValues.forEach((rssi) => {
    if (rssi >= -50) {
      signalDistribution.excellent++;
    } else if (rssi >= -60) {
      signalDistribution.good++;
    } else if (rssi >= -70) {
      signalDistribution.fair++;
    } else if (rssi >= -80) {
      signalDistribution.weak++;
    } else {
      signalDistribution.veryWeak++;
    }
  });

  /*
   * Total surveyed distance.
   */
  let totalSurveyDistance = 0;

  for (
    let index = 1;
    index < validLocationPoints.length;
    index++
  ) {
    const previous =
      validLocationPoints[index - 1];

    const current =
      validLocationPoints[index];

    totalSurveyDistance +=
      calculateDistanceMeters(
        previous.latitude as number,
        previous.longitude as number,
        current.latitude as number,
        current.longitude as number
      );
  }

  const getDistributionPercent = (
    count: number
  ) => {
    if (validRssiValues.length === 0) {
      return 0;
    }

    return (
      (count / validRssiValues.length) *
      100
    );
  };

  return (
    <div className="coverage-page">
      {/* Header */}
      <div className="coverage-header">
        <div>
          <div className="eyebrow">
            Coverage Analysis
          </div>

          <h2>Wi-Fi Coverage</h2>

          <p>
            Collect real Wi-Fi signal measurements
            with GPS coordinates.
          </p>
        </div>

        <div className="coverage-actions">
          {!surveyRunning ? (
            <button
              className="coverage-action-button"
              onClick={startSurvey}
            >
              <Play size={16} />
              Start Survey
            </button>
          ) : (
            <button
              className="coverage-action-button"
              onClick={stopSurvey}
            >
              <Square size={16} />
              Stop Survey
            </button>
          )}

          <button
            className="coverage-action-button"
            onClick={() =>
              collectMeasurement(false)
            }
            disabled={
              loading || surveyRunning
            }
          >
            <Signal size={16} />

            {loading
              ? "Collecting..."
              : "Collect Point"}
          </button>

          <button
            className="coverage-action-button"
            onClick={loadMeasurements}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            className="coverage-action-button"
            onClick={clearMeasurements}
            disabled={
              measurements.length === 0
            }
          >
            <Trash2 size={16} />
            Clear
          </button>
        </div>
      </div>

      {/* Survey status */}
      <div
        style={{
          marginBottom: "18px",
          padding: "12px 16px",
          borderRadius: "10px",
          background: surveyRunning
            ? "rgba(53, 212, 154, 0.10)"
            : "rgba(255, 255, 255, 0.035)",
          border: surveyRunning
            ? "1px solid rgba(53, 212, 154, 0.25)"
            : "1px solid rgba(255, 255, 255, 0.07)",
          color: "#aeb4c4",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Wifi size={16} />
        <span>{surveyStatus}</span>
      </div>

      {/* Existing summary cards */}
      <div className="coverage-summary">
        <div className="coverage-summary-card">
          <span>Measurements</span>
          <strong>
            {measurements.length}
          </strong>
        </div>

        <div className="coverage-summary-card">
          <span>Current RSSI</span>
          <strong>
            {latestMeasurement?.rssi_dbm != null
              ? `${latestMeasurement.rssi_dbm} dBm`
              : "--"}
          </strong>
        </div>

        <div className="coverage-summary-card">
          <span>Signal</span>
          <strong>
            {latestMeasurement?.signal_percent !=
            null
              ? `${latestMeasurement.signal_percent}%`
              : "--"}
          </strong>
        </div>

        <div className="coverage-summary-card">
          <span>Channel</span>
          <strong>
            {latestMeasurement?.channel ??
              "--"}
          </strong>
        </div>
      </div>

      {/* Map */}
      <div className="coverage-card">
        <div className="coverage-card-header">
          <div>
            <span className="eyebrow">
              Measurement Map
            </span>

            <h3>
              Wi-Fi Signal Coverage
            </h3>
          </div>
        </div>

        <CoverageMap
          measurements={measurements}
        />
      </div>

      {/* Coverage Statistics */}
      <div className="coverage-card">
        <div className="coverage-card-header">
          <div>
            <span className="eyebrow">
              Coverage Statistics
            </span>

            <h3>
              Signal Analysis
            </h3>
          </div>
        </div>

        {validRssiValues.length === 0 ? (
          <div className="coverage-empty">
            <Signal size={28} />

            <h3>
              No statistics available yet
            </h3>

            <p>
              Collect coverage measurements to
              calculate signal statistics.
            </p>
          </div>
        ) : (
          <>
            {/* Overall coverage quality */}
            <div
              style={{
                marginBottom: "20px",
                padding: "18px",
                borderRadius: "12px",
                background:
                  "rgba(255,255,255,0.035)",
                border: `1px solid ${coverageQuality.color}40`,
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  background:
                    coverageQuality.color,
                  boxShadow: `0 0 14px ${coverageQuality.color}`,
                  flexShrink: 0,
                }}
              />

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#8f96a8",
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.08em",
                    marginBottom: "5px",
                  }}
                >
                  Overall Coverage Quality
                </div>

                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color:
                      coverageQuality.color,
                    marginBottom: "4px",
                  }}
                >
                  {coverageQuality.label}
                </div>

                <div
                  style={{
                    fontSize: "13px",
                    color: "#aeb4c4",
                  }}
                >
                  {coverageQuality.description}
                </div>
              </div>

              <div
                style={{
                  textAlign: "right",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#8f96a8",
                    marginBottom: "4px",
                  }}
                >
                  Average RSSI
                </div>

                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#e8ebf2",
                  }}
                >
                  {averageRssi !== null
                    ? `${averageRssi.toFixed(
                        1
                      )} dBm`
                    : "--"}
                </div>
              </div>
            </div>

            {/* Main statistics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(4, 1fr)",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
              <div className="coverage-summary-card">
                <span>Average RSSI</span>
                <strong>
                  {averageRssi !== null
                    ? `${averageRssi.toFixed(
                        1
                      )} dBm`
                    : "--"}
                </strong>
              </div>

              <div className="coverage-summary-card">
                <span>Strongest RSSI</span>
                <strong>
                  {strongestRssi !== null
                    ? `${strongestRssi} dBm`
                    : "--"}
                </strong>
              </div>

              <div className="coverage-summary-card">
                <span>Weakest RSSI</span>
                <strong>
                  {weakestRssi !== null
                    ? `${weakestRssi} dBm`
                    : "--"}
                </strong>
              </div>

              <div className="coverage-summary-card">
                <span>Average Signal</span>
                <strong>
                  {averageSignal !== null
                    ? `${averageSignal.toFixed(
                        1
                      )}%`
                    : "--"}
                </strong>
              </div>
            </div>

            {/* Survey information */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, 1fr)",
                gap: "14px",
                marginBottom: "20px",
              }}
            >
              <div className="coverage-summary-card">
                <span>
                  Survey Distance
                </span>

                <strong>
                  {totalSurveyDistance >=
                  1000
                    ? `${(
                        totalSurveyDistance /
                        1000
                      ).toFixed(2)} km`
                    : `${totalSurveyDistance.toFixed(
                        1
                      )} m`}
                </strong>
              </div>

              <div className="coverage-summary-card">
                <span>
                  Valid GPS Points
                </span>

                <strong>
                  {validLocationPoints.length}
                </strong>
              </div>
            </div>

            {/* Distribution */}
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#dfe3ec",
                  marginBottom: "12px",
                }}
              >
                Signal Distribution
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <DistributionRow
                  label="Excellent"
                  range="≥ -50 dBm"
                  count={
                    signalDistribution.excellent
                  }
                  percent={getDistributionPercent(
                    signalDistribution.excellent
                  )}
                  color="#35d49a"
                />

                <DistributionRow
                  label="Good"
                  range="-50 to -60 dBm"
                  count={
                    signalDistribution.good
                  }
                  percent={getDistributionPercent(
                    signalDistribution.good
                  )}
                  color="#8bd450"
                />

                <DistributionRow
                  label="Fair"
                  range="-60 to -70 dBm"
                  count={
                    signalDistribution.fair
                  }
                  percent={getDistributionPercent(
                    signalDistribution.fair
                  )}
                  color="#e7bd45"
                />

                <DistributionRow
                  label="Weak"
                  range="-70 to -80 dBm"
                  count={
                    signalDistribution.weak
                  }
                  percent={getDistributionPercent(
                    signalDistribution.weak
                  )}
                  color="#ed8b45"
                />

                <DistributionRow
                  label="Very Weak"
                  range="< -80 dBm"
                  count={
                    signalDistribution.veryWeak
                  }
                  percent={getDistributionPercent(
                    signalDistribution.veryWeak
                  )}
                  color="#ef6262"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Measurements table */}
      <div className="coverage-card">
        <div className="coverage-card-header">
          <div>
            <span className="eyebrow">
              Collected Measurements
            </span>

            <h3>
              {measurements.length}{" "}
              {measurements.length === 1
                ? "measurement"
                : "measurements"}
            </h3>
          </div>
        </div>

        {measurements.length === 0 ? (
          <div className="coverage-empty">
            <Wifi size={28} />

            <h3>
              No measurements yet
            </h3>

            <p>
              Collect a point or start a survey
              to begin measuring Wi-Fi
              coverage.
            </p>
          </div>
        ) : (
          <div className="coverage-table-wrapper">
            <table className="coverage-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>RSSI</th>
                  <th>Signal</th>
                  <th>Channel</th>
                  <th>Band</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Accuracy</th>
                  <th>Time</th>
                </tr>
              </thead>

              <tbody>
                {[...measurements]
                  .reverse()
                  .map((point, index) => (
                    <tr
                      key={`${point.timestamp}-${index}`}
                    >
                      <td>{index + 1}</td>

                      <td>
                        {point.rssi_dbm != null
                          ? `${point.rssi_dbm} dBm`
                          : "--"}
                      </td>

                      <td>
                        {point.signal_percent !=
                        null
                          ? `${point.signal_percent}%`
                          : "--"}
                      </td>

                      <td>
                        {point.channel ?? "--"}
                      </td>

                      <td>
                        {point.band ?? "--"}
                      </td>

                      <td>
                        {point.latitude != null
                          ? point.latitude.toFixed(
                              6
                            )
                          : "--"}
                      </td>

                      <td>
                        {point.longitude != null
                          ? point.longitude.toFixed(
                              6
                            )
                          : "--"}
                      </td>

                      <td>
                        {point.accuracy_m != null
                          ? `${point.accuracy_m.toFixed(
                              1
                            )} m`
                          : "--"}
                      </td>

                      <td>
                        {new Date(
                          point.timestamp
                        ).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DistributionRow({
  label,
  range,
  count,
  percent,
  color,
}: {
  label: string;
  range: string;
  count: number;
  percent: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "100px 110px 1fr 70px",
        alignItems: "center",
        gap: "10px",
        fontSize: "12px",
      }}
    >
      <span
        style={{
          color: "#dfe3ec",
          fontWeight: 600,
        }}
      >
        {label}
      </span>

      <span
        style={{
          color: "#8f96a8",
        }}
      >
        {range}
      </span>

      <div
        style={{
          height: "7px",
          background:
            "rgba(255,255,255,0.07)",
          borderRadius: "999px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: color,
            borderRadius: "999px",
            transition:
              "width 0.3s ease",
          }}
        />
      </div>

      <span
        style={{
          textAlign: "right",
          color: "#aeb4c4",
        }}
      >
        {count} ({percent.toFixed(0)}%)
      </span>
    </div>
  );
}

export default CoverageAnalyzer;