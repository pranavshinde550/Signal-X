import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  CircleHelp,
  Gauge,
  History,
  LayoutDashboard,
  Map,
  Radio,
  Settings,
  ShieldCheck,
  Signal,
  Wifi,
} from "lucide-react";
import ReactECharts from "echarts-for-react";
import { Capacitor } from "@capacitor/core";
import { WifiInfo } from "./nativeWifi";
import NetworksPage from "./NetworksPage";
import "./App.css";
import { SIGNALX_WS_URL } from "./signalxConfig";

import ChannelAnalyzer from "./ChannelAnalyzer";

import PerformanceAnalyzer from "./PerformanceAnalyzer";

import CoverageAnalyzer from "./CoverageAnalyzer";

type WifiData = {
  connected: boolean;
  ssid: string | null;
  bssid: string | null;
  signal_percent: number | null;
  rssi_dbm: number | null;
  band: string | null;
  channel: number | null;
  radio_type: string | null;
  receive_rate_mbps: number | null;
  transmit_rate_mbps: number | null;
  authentication: string | null;
  cipher: string | null;
};

type Page =
  | "dashboard"
  | "networks"
  | "channel"
  | "performance"
  | "coverage"
  | "history"
  | "settings";

const navigation = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "networks", label: "Networks", Icon: Wifi },
  { id: "channel", label: "Channel Analyzer", Icon: Radio },
  { id: "performance", label: "Performance", Icon: Gauge },
  { id: "coverage", label: "Coverage", Icon: Map },
  { id: "history", label: "History", Icon: History },
  { id: "settings", label: "Settings", Icon: Settings },
] as const;

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [wifi, setWifi] = useState<WifiData | null>(null);
  const [socketState, setSocketState] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [lastUpdate, setLastUpdate] = useState("--");
  const [history, setHistory] = useState<{ time: string; rssi: number }[]>([]);
  const [measurementPulse, setMeasurementPulse] = useState(false);

  /*
   * Display-only RSSI animation.
   *
   * The actual RSSI from the backend remains untouched in `wifi`.
   * This value only controls how the number visually moves between
   * two real measurements.
   */
  const [displayRssi, setDisplayRssi] = useState<number | null>(null);
  const displayRssiRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() === "android") {
      setSocketState("connected");
      return;
    }

    let ws: WebSocket | null = null;
    let retry: number | undefined;
    let stopped = false;

    const connect = () => {
      if (stopped) return;

      setSocketState("connecting");

      ws = new WebSocket(SIGNALX_WS_URL);

      ws.onopen = () =>
        !stopped && setSocketState("connected");

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as {
            type: string;
            data: WifiData;
            timestamp: string;
          };

          if (message.type !== "wifi_metrics") return;

          setWifi(message.data);
          setMeasurementPulse(true);
          window.setTimeout(() => {
            setMeasurementPulse(false);
          }, 350);

          const time = new Date(
            message.timestamp
          ).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          setLastUpdate(time);

          if (typeof message.data.rssi_dbm === "number") {
            setHistory((old) => [
              ...old,
              {
                time,
                rssi: message.data.rssi_dbm as number,
              },
            ].slice(-60));
          }
        } catch (error) {
          console.error(
            "Signal-X: invalid live data",
            error
          );
        }
      };

      ws.onerror = () =>
        !stopped && setSocketState("disconnected");

      ws.onclose = () => {
        if (stopped) return;

        setSocketState("disconnected");

        retry = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;

      if (retry !== undefined) {
        window.clearTimeout(retry);
      }

      ws?.close();
    };
  }, []);

  /*
   * Android native Wi-Fi monitoring.
   *
   * Windows keeps using the existing WebSocket backend.
   * Android reads the phone's Wi-Fi adapter directly through
   * the Capacitor native plugin.
   */
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") {
      return;
    }

    let stopped = false;

    const readWifi = async () => {
      try {
        const nativeWifi = await WifiInfo.getCurrentWifi();

        if (stopped) return;

        const nextWifi: WifiData = {
          connected: nativeWifi.connected,
          ssid: nativeWifi.ssid ?? null,
          bssid: nativeWifi.bssid ?? null,
          signal_percent: nativeWifi.signal_percent ?? null,
          rssi_dbm: nativeWifi.rssi_dbm ?? null,
          band: nativeWifi.band ?? null,
          channel: nativeWifi.channel ?? null,
          radio_type: nativeWifi.radio_type ?? null,
          receive_rate_mbps:
            typeof nativeWifi.receive_rate_mbps === "number"
              ? nativeWifi.receive_rate_mbps
              : null,
          transmit_rate_mbps:
            typeof nativeWifi.transmit_rate_mbps === "number"
              ? nativeWifi.transmit_rate_mbps
              : null,
          authentication: nativeWifi.authentication ?? null,
          cipher: nativeWifi.cipher ?? null,
        };

        setWifi(nextWifi);
        setMeasurementPulse(true);
        window.setTimeout(() => {
          if (!stopped) {
            setMeasurementPulse(false);
          }
        }, 350);

        const time = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        setLastUpdate(time);

        if (typeof nextWifi.rssi_dbm === "number") {
          setHistory((old) => [
            ...old,
            {
              time,
              rssi: nextWifi.rssi_dbm as number,
            },
          ].slice(-60));
        }
      } catch (error) {
        if (!stopped) {
          console.error(
            "Signal-X: Android Wi-Fi read failed",
            error
          );
          setSocketState("disconnected");
        }
      }
    };

    readWifi();
    const timer = window.setInterval(readWifi, 1000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  /*
   * Smoothly animate the displayed RSSI toward the latest
   * real backend measurement.
   */
  useEffect(() => {
    const target = wifi?.rssi_dbm;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (typeof target !== "number") {
      displayRssiRef.current = null;
      setDisplayRssi(null);
      return;
    }

    const start =
      typeof displayRssiRef.current === "number"
        ? displayRssiRef.current
        : target;

    if (start === target) {
      displayRssiRef.current = target;
      setDisplayRssi(target);
      return;
    }

    const duration = 450;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      /*
       * Ease-out curve:
       * starts quickly and settles smoothly at the
       * latest measured RSSI.
       */
      const eased =
        1 - Math.pow(1 - progress, 3);

      const value =
        start + (target - start) * eased;

      displayRssiRef.current = value;
      setDisplayRssi(value);

      if (progress < 1) {
        animationFrameRef.current =
          requestAnimationFrame(animate);
      } else {
        displayRssiRef.current = target;
        setDisplayRssi(target);
      }
    };

    animationFrameRef.current =
      requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [wifi?.rssi_dbm]);

  const rssi = wifi?.rssi_dbm;

  const quality =
    rssi == null
      ? "Unknown"
      : rssi >= -50
        ? "Excellent"
        : rssi >= -60
          ? "Good"
          : rssi >= -70
            ? "Fair"
            : "Poor";

  const tone =
    rssi == null
      ? "neutral"
      : rssi >= -50
        ? "excellent"
        : rssi >= -60
          ? "good"
          : rssi >= -70
            ? "warning"
            : "critical";

  const percent = wifi?.signal_percent ?? 0;
  const online = socketState === "connected";

  const formattedRssi =
    displayRssi == null
      ? "--"
      : `${Math.round(displayRssi)}`;

  const chart = useMemo(
    () => ({
      animation: false,
      backgroundColor: "transparent",
      grid: {
        left: 64,
        right: 18,
        top: 15,
        bottom: 30,
        containLabel: false,
      },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: number) => `${v} dBm`,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: history.map((x) => x.time),
        axisLabel: {
          color: "#7f8a9d",
          fontSize: 11,
          hideOverlap: true,
        },
        axisLine: {
          lineStyle: {
            color: "#273142",
          },
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        min: -100,
        max: -30,
        interval: 10,
        axisLabel: {
          color: "#7f8a9d",
          formatter: "{value} dBm",
          fontSize: 11,
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          lineStyle: {
            color: "#202936",
          },
        },
      },
      series: [
        {
          name: "RSSI",
          type: "line",
          data: history.map((x) => x.rssi),
          showSymbol: false,
          smooth: 0.18,
          lineStyle: {
            width: 3,
            color: "#77a5ff",
          },
          itemStyle: {
            color: "#77a5ff",
          },
          areaStyle: {
            color: "rgba(90,143,255,.07)",
          },
        },
      ],
    }),
    [history]
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Wifi size={23} />
          </div>

          <div>
            <h1>Signal-X</h1>
            <span>Network Intelligence</span>
          </div>
        </div>

        <nav
          className="navigation"
          aria-label="Signal-X sections"
        >
          {navigation.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${
                page === id ? "active" : ""
              }`}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="backend-status">
            <span
              className={`status-dot ${
                online ? "online" : "offline"
              }`}
            />

            <div>
              <strong>
                {online
                  ? "Live Connected"
                  : socketState === "connecting"
                    ? "Connecting..."
                    : "Disconnected"}
              </strong>

              <small>WebSocket engine</small>
            </div>
          </div>

          <div className="version">
            Signal-X v1.0.0
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h2>
              {page === "dashboard"
                ? "Dashboard"
                : navigation.find(
                    (x) => x.id === page
                  )?.label}
            </h2>

            <p>
              {page === "dashboard"
                ? "Real-time Wi-Fi signal monitoring"
                : page === "networks"
                  ? "Discover nearby Wi-Fi networks"
                  : "Signal-X network intelligence"}
            </p>
          </div>

          <div className="topbar-actions">
            <div className="live-indicator">
              <span />
              {online
                ? "LIVE MONITORING"
                : "RECONNECTING"}
            </div>

            <button
              type="button"
              className="icon-button"
              title="Signal-X help"
              onClick={() =>
                window.alert(
                  "Signal-X reads your connected Wi-Fi data locally. Open Networks to scan nearby access points."
                )
              }
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>

        {page === "dashboard" && (
          <>
            <section className="hero-grid">
              <article
              className={`connection-card ${
                measurementPulse ? "measurement-pulse" : ""
                }`}
              >
                <div className="card-header">
                  <div>
                    <span className="eyebrow">
                      LIVE CONNECTION
                    </span>
                    <h3>Current Wi-Fi Network</h3>
                  </div>

                  <div className="wifi-icon">
                    <Wifi size={25} />
                  </div>
                </div>

                <div className="signal-main">
                  <span
                    className={`rssi ${tone} rssi-live-value`}
                  >
                    {formattedRssi}
                  </span>

                  <span className="dbm">
                    dBm
                  </span>
                </div>

                <span
                  className={`signal-label ${tone}`}
                >
                  {quality} Signal
                </span>

                <div className="connection-details">
                  <div>
                    <span>SSID</span>
                    <strong>
                      {wifi?.ssid || "--"}
                    </strong>
                  </div>

                  <div>
                    <span>Band</span>
                    <strong>
                      {wifi?.band || "--"}
                    </strong>
                  </div>

                  <div>
                    <span>Channel</span>
                    <strong>
                      {wifi?.channel ?? "--"}
                    </strong>
                  </div>
                </div>
              </article>

              <article className="health-card">
                <div className="card-header">
                  <div>
                    <span className="eyebrow">
                      NETWORK HEALTH
                    </span>
                    <h3>Connection Health</h3>
                  </div>

                  <ShieldCheck size={23} />
                </div>

                <div className="health-score">
                  <div
                    className="health-ring"
                    style={{
                      background: `radial-gradient(circle,#0e131d 59%,transparent 60%),conic-gradient(#4bda96 0deg ${
                        percent * 3.6
                      }deg,#202936 ${
                        percent * 3.6
                      }deg 360deg)`,
                    }}
                  >
                    <div>
                      <strong>
                        {wifi?.signal_percent ?? "--"}%
                      </strong>
                      <br />
                      <span>Signal</span>
                    </div>
                  </div>

                  <div className="health-info">
                    <strong>{quality}</strong>
                    <p>
                      Signal strength is being
                      monitored in real time from
                      your Wi-Fi adapter.
                    </p>
                  </div>
                </div>
              </article>
            </section>

            <section className="metrics-grid">
              <article className="metric-card">
                <div className="metric-icon">
                  <Signal size={19} />
                </div>

                <div>
                  <span>Signal Strength</span>
                  <strong>
                    {rssi == null
                      ? "--"
                      : `${formattedRssi} dBm`}
                  </strong>
                </div>
              </article>

              <article className="metric-card">
                <div className="metric-icon">
                  <Radio size={19} />
                </div>

                <div>
                  <span>Radio Type</span>
                  <strong>
                    {wifi?.radio_type || "--"}
                  </strong>
                </div>
              </article>

              <article className="metric-card">
                <div className="metric-icon">
                  <Activity size={19} />
                </div>

                <div>
                  <span>Receive Rate</span>
                  <strong>
                    {wifi?.receive_rate_mbps == null
                      ? "--"
                      : `${wifi.receive_rate_mbps} Mbps`}
                  </strong>
                </div>
              </article>

              <article className="metric-card">
                <div className="metric-icon">
                  <BarChart3 size={19} />
                </div>

                <div>
                  <span>Transmit Rate</span>
                  <strong>
                    {wifi?.transmit_rate_mbps == null
                      ? "--"
                      : `${wifi.transmit_rate_mbps} Mbps`}
                  </strong>
                </div>
              </article>
            </section>

            <section className="chart-placeholder">
              <div className="card-header">
                <div>
                  <span className="eyebrow">
                    REAL-TIME ANALYTICS
                  </span>
                  <h3>Live RSSI Signal</h3>
                </div>

                <span className="chart-status">
                  Last 60 samples · 1 second
                </span>
              </div>

              <div className="signal-chart">
                {history.length ? (
                  <ReactECharts
                    option={chart}
                    notMerge={false}
                    lazyUpdate
                    style={{
                      height: "100%",
                      width: "100%",
                    }}
                  />
                ) : (
                  <div className="empty-chart">
                    <Signal size={30} />
                    <h4>
                      Waiting for Wi-Fi data
                    </h4>
                    <p>
                      Live signal measurements will
                      appear when the backend connects.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="bottom-grid">
              <article className="info-card">
                <div className="card-header">
                  <div>
                    <span className="eyebrow">
                      CONNECTION
                    </span>
                    <h3>Network Details</h3>
                  </div>
                </div>

                <div className="details-list">
                  <div>
                    <span>SSID</span>
                    <strong>
                      {wifi?.ssid || "--"}
                    </strong>
                  </div>

                  <div>
                    <span>Security</span>
                    <strong>
                      {wifi?.authentication ||
                        "--"}
                    </strong>
                  </div>

                  <div>
                    <span>Cipher</span>
                    <strong>
                      {wifi?.cipher || "--"}
                    </strong>
                  </div>

                  <div>
                    <span>BSSID</span>
                    <strong>
                      {wifi?.bssid || "--"}
                    </strong>
                  </div>
                </div>
              </article>

              <article className="info-card">
                <div className="card-header">
                  <div>
                    <span className="eyebrow">
                      SYSTEM STATUS
                    </span>
                    <h3>Signal-X Engine</h3>
                  </div>
                </div>

                <div className="system-status">
                  <div className="system-row">
                    <span>Wi-Fi adapter</span>
                    <b
                      className={
                        wifi?.connected
                          ? "success"
                          : ""
                      }
                    >
                      {wifi?.connected
                        ? "Connected"
                        : "Disconnected"}
                    </b>
                  </div>

                  <div className="system-row">
                    <span>Backend</span>
                    <b
                      className={
                        online ? "success" : ""
                      }
                    >
                      {online
                        ? "Online"
                        : "Unavailable"}
                    </b>
                  </div>

                  <div className="system-row">
                    <span>WebSocket</span>
                    <b
                      className={
                        online ? "success" : ""
                      }
                    >
                      {socketState}
                    </b>
                  </div>

                  <div className="system-row">
                    <span>Monitoring</span>
                    <b
                      className={
                        online ? "success" : ""
                      }
                    >
                      {online
                        ? "Active"
                        : "Paused"}
                    </b>
                  </div>

                  <div className="system-row">
                    <span>Last update</span>
                    <b>{lastUpdate}</b>
                  </div>
                </div>
              </article>
            </section>
          </>
        )}

        {page === "networks" && <NetworksPage />}

        {page === "channel" && <ChannelAnalyzer />}

        {page === "performance" && (
          <PerformanceAnalyzer />
        )}

        {page === "coverage" && (
          <CoverageAnalyzer />
        )}

        {page !== "dashboard" &&
          page !== "networks" &&
          page !== "channel" &&
          page !== "performance" &&
          page !== "coverage" && (
            <section className="info-card module-placeholder">
              <h3>
                {
                  navigation.find(
                    (x) => x.id === page
                  )?.label
                }
              </h3>

              <p>
                This module is ready for the next
                development step. Your dashboard and
                network scanner remain available from
                the sidebar.
              </p>
            </section>
          )}
      </main>

      <nav
        className="mobile-bottom-nav"
        aria-label="Mobile Signal-X navigation"
      >
        {navigation
          .filter((item) =>
            ["dashboard", "networks", "performance", "coverage"].includes(item.id)
          )
          .map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`mobile-nav-item ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
              aria-label={label}
            >
              <Icon size={20} />
              <span>{id === "dashboard" ? "Home" : label === "Performance" ? "Performance" : label}</span>
            </button>
          ))}
      </nav>
    </div>
  );
}