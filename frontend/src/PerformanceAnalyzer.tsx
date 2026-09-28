import { useEffect, useState } from "react";
import {
  Activity,
  RefreshCw,
  Download,
  Upload,
  Wifi,
  Radio,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { WifiInfo } from "./nativeWifi";
import "./PerformanceAnalyzer.css";
import { SIGNALX_API_BASE } from "./signalxConfig";

type PerformanceData = {
  connection_state: string;
  ssid: string | null;
  signal_percent: number | null;
  rssi_dbm: number | null;
  receive_rate_mbps: number | null;
  transmit_rate_mbps: number | null;
  channel: number | null;
  band: string | null;
  radio_type: string | null;
};

type PerformanceResponse = {
  success: boolean;
  performance: PerformanceData | null;
  error: string | null;
};

type LatencyResponse = {
  success: boolean;
  gateway: string | null;
  latency_ms: number | null;
  status: string;
  error: string | null;
};

function PerformanceAnalyzer() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<LatencyResponse | null>(null);

  const isAndroid = Capacitor.getPlatform() === "android";

  const loadPerformance = async () => {
    setLoading(true);
    setError("");

    try {
      if (isAndroid) {
        const nativeWifi = await WifiInfo.getCurrentWifi();

        if (!nativeWifi.connected) {
          throw new Error(
            nativeWifi.message || "No active Wi-Fi connection."
          );
        }

        const nativePerformance: PerformanceData = {
          connection_state: "Connected",
          ssid: nativeWifi.ssid ?? null,
          signal_percent: nativeWifi.signal_percent ?? null,
          rssi_dbm: nativeWifi.rssi_dbm ?? null,

          receive_rate_mbps:
            typeof nativeWifi.receive_rate_mbps === "number" &&
            nativeWifi.receive_rate_mbps >= 0
              ? nativeWifi.receive_rate_mbps
              : null,

          transmit_rate_mbps:
            typeof nativeWifi.transmit_rate_mbps === "number" &&
            nativeWifi.transmit_rate_mbps >= 0
              ? nativeWifi.transmit_rate_mbps
              : null,

          channel: nativeWifi.channel ?? null,
          band: nativeWifi.band ?? null,
          radio_type: nativeWifi.radio_type ?? null,
        };

        setData(nativePerformance);

        setLatency({
          success:
            typeof nativeWifi.latency_ms === "number" &&
            nativeWifi.latency_ms >= 0,
          gateway: nativeWifi.gateway ?? null,
          latency_ms:
            typeof nativeWifi.latency_ms === "number" &&
            nativeWifi.latency_ms >= 0
              ? nativeWifi.latency_ms
              : null,
          status: nativeWifi.latency_status ?? "Unavailable",
          error:
            typeof nativeWifi.latency_ms === "number"
              ? null
              : "Unable to measure Wi-Fi gateway latency.",
        });

        return;
      }

      const response = await fetch(
        `${SIGNALX_API_BASE}/api/wifi/performance`
      );

      if (!response.ok) {
        throw new Error("Performance request failed.");
      }

      const result: PerformanceResponse = await response.json();

      if (!result.success || !result.performance) {
        throw new Error(
          result.error || "Unable to collect performance data."
        );
      }

      setData(result.performance);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to collect performance data."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadLatency = async () => {
    if (isAndroid) {
      return;
    }

    try {
      const response = await fetch(
        `${SIGNALX_API_BASE}/api/wifi/latency`
      );

      if (!response.ok) {
        throw new Error("Latency request failed.");
      }

      const result: LatencyResponse = await response.json();
      setLatency(result);
    } catch {
      setLatency({
        success: false,
        gateway: null,
        latency_ms: null,
        status: "Unavailable",
        error: "Unable to measure latency.",
      });
    }
  };

  useEffect(() => {
    loadPerformance();
    loadLatency();
  }, []);

  const getSignalClass = (signal: number | null) => {
    if (signal === null) return "neutral";
    if (signal >= 75) return "excellent";
    if (signal >= 50) return "good";
    if (signal >= 25) return "warning";
    return "critical";
  };

  const signalClass = getSignalClass(data?.signal_percent ?? null);

  return (
    <div className="performance-analyzer">
      <div className="performance-header">
        <div>
          <div className="performance-eyebrow">
            <Activity size={15} />
            PERFORMANCE ANALYSIS
          </div>

          <h2>Wi-Fi Performance</h2>

          <p>
            Monitor the current performance of your active Wi-Fi
            connection.
          </p>
        </div>

        <button
          className="performance-refresh"
          onClick={loadPerformance}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={loading ? "performance-spinning" : ""}
          />
          {loading ? "Reading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="performance-error">
          <span>{error}</span>
        </div>
      )}

      {data && !error && (
        <>
          <div className="performance-overview">
            <div className="performance-card signal-performance-card">
              <div className="performance-card-top">
                <span>Signal Strength</span>
                <Wifi size={19} />
              </div>

              <div className={`performance-signal ${signalClass}`}>
                {data.signal_percent ?? "--"}%
              </div>

              <div className="performance-rssi">
                RSSI{" "}
                <strong>
                  {data.rssi_dbm !== null
                    ? `${data.rssi_dbm} dBm`
                    : "--"}
                </strong>
              </div>
            </div>

            <div className="performance-card">
              <div className="performance-card-top">
                <span>Receive Rate</span>
                <Download size={19} />
              </div>

              <div className="performance-value">
                {data.receive_rate_mbps ?? "--"}
                <small>Mbps</small>
              </div>

              <p>Current link receive rate</p>
            </div>

            <div className="performance-card">
              <div className="performance-card-top">
                <span>Transmit Rate</span>
                <Upload size={19} />
              </div>

              <div className="performance-value">
                {data.transmit_rate_mbps ?? "--"}
                <small>Mbps</small>
              </div>

              <p>Current link transmit rate</p>
            </div>

            <div className="performance-card">
              <div className="performance-card-top">
                <span>Connection</span>
                <Radio size={19} />
              </div>

              <div className="performance-status">
                <span className="performance-status-dot" />
                {data.connection_state}
              </div>

              <div className="performance-card">
                <div className="performance-card-top">
                  <span>Wi-Fi Latency</span>
                  <Activity size={19} />
                </div>

                <div className="performance-value">
                  {latency?.latency_ms ?? "--"}
                  <small>ms</small>
                </div>

                <p>
                  Gateway: {latency?.gateway || "--"}
                </p>
              </div>

              <p>{data.ssid || "Unknown network"}</p>
            </div>
          </div>

          <div className="performance-details">
            <div className="performance-details-card">
              <div className="performance-section-title">
                Connection Details
              </div>

              <div className="performance-details-grid">
                <div>
                  <span>Network</span>
                  <strong>{data.ssid || "--"}</strong>
                </div>

                <div>
                  <span>Band</span>
                  <strong>{data.band || "--"}</strong>
                </div>

                <div>
                  <span>Channel</span>
                  <strong>{data.channel ?? "--"}</strong>
                </div>

                <div>
                  <span>Radio</span>
                  <strong>{data.radio_type || "--"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="performance-disclaimer">
            These values represent the current Wi-Fi link information
            reported by the wireless adapter. Receive and transmit rates
            are link rates, not an internet speed-test result.
          </div>
        </>
      )}
    </div>
  );
}

export default PerformanceAnalyzer;