import { useEffect, useState } from "react";
import {
  Radio,
  RefreshCw,
  Wifi,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import "./ChannelAnalyzer.css";
import { SIGNALX_API_BASE } from "./signalxConfig";
import { WifiInfo } from "./nativeWifi";

type ChannelData = {
  channel: number;
  network_count: number;
  congestion: string;
};

type ChannelResponse = {
  success: boolean;
  total_networks: number;
  total_channels: number;
  channels: ChannelData[];
  bands: {
    "2.4 GHz": ChannelData[];
    "5/6 GHz": ChannelData[];
  };
  error: string | null;
};

function getCongestion(networkCount: number): string {
  if (networkCount <= 1) {
    return "Low";
  }

  if (networkCount <= 3) {
    return "Medium";
  }

  return "High";
}

function buildAndroidChannelResponse(
  networks: Awaited<ReturnType<typeof WifiInfo.scanNetworks>>["networks"]
): ChannelResponse {
  const channelMap = new Map<number, number>();

  for (const network of networks) {
    if (
      typeof network.channel !== "number" ||
      !Number.isFinite(network.channel) ||
      network.channel <= 0
    ) {
      continue;
    }

    channelMap.set(
      network.channel,
      (channelMap.get(network.channel) ?? 0) + 1
    );
  }

  const channels: ChannelData[] = Array.from(
    channelMap.entries()
  )
    .sort((a, b) => a[0] - b[0])
    .map(([channel, networkCount]) => ({
      channel,
      network_count: networkCount,
      congestion: getCongestion(networkCount),
    }));

  const band24Channels = new Map<number, number>();
  const band56Channels = new Map<number, number>();

  for (const network of networks) {
    if (
      typeof network.channel !== "number" ||
      !Number.isFinite(network.channel) ||
      network.channel <= 0
    ) {
      continue;
    }

    if (network.band === "2.4 GHz") {
      band24Channels.set(
        network.channel,
        (band24Channels.get(network.channel) ?? 0) + 1
      );
    } else {
      band56Channels.set(
        network.channel,
        (band56Channels.get(network.channel) ?? 0) + 1
      );
    }
  }

  const convertBand = (
    bandMap: Map<number, number>
  ): ChannelData[] => {
    return Array.from(bandMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([channel, networkCount]) => ({
        channel,
        network_count: networkCount,
        congestion: getCongestion(networkCount),
      }));
  };

  return {
    success: true,
    total_networks: networks.length,
    total_channels: channels.length,
    channels,
    bands: {
      "2.4 GHz": convertBand(band24Channels),
      "5/6 GHz": convertBand(band56Channels),
    },
    error: null,
  };
}

function ChannelAnalyzer() {
  const [data, setData] = useState<ChannelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scanChannels = async () => {
    setLoading(true);
    setError("");

    try {
      /*
       * ============================================================
       * ANDROID
       * ============================================================
       *
       * Android cannot use 127.0.0.1:8000 to access the Windows
       * backend. It reads nearby Wi-Fi networks directly through
       * the native Android Wi-Fi plugin.
       */
      if (Capacitor.getPlatform() === "android") {
        const result = await WifiInfo.scanNetworks();

        if (!result.success) {
          throw new Error(
            result.error ||
              "Unable to scan nearby Wi-Fi networks."
          );
        }

        const channelResult =
          buildAndroidChannelResponse(result.networks);

        setData(channelResult);
        return;
      }

      /*
       * ============================================================
       * WINDOWS / ELECTRON / WEB
       * ============================================================
       *
       * Existing backend behavior remains unchanged.
       */
      const response = await fetch(
        `${SIGNALX_API_BASE}/api/wifi/channels`
      );

      if (!response.ok) {
        throw new Error(
          "Channel analysis request failed."
        );
      }

      const result: ChannelResponse =
        await response.json();

      if (!result.success) {
        throw new Error(
          result.error ||
            "Unable to analyze channels."
        );
      }

      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scanChannels();
  }, []);

  const getCongestionClass = (
    congestion: string
  ) => {
    switch (congestion) {
      case "Low":
        return "low";

      case "Medium":
        return "medium";

      case "High":
        return "high";

      default:
        return "neutral";
    }
  };

  const renderChannels = (
    channels: ChannelData[]
  ) => {
    if (channels.length === 0) {
      return (
        <div className="channel-empty">
          No networks detected in this band.
        </div>
      );
    }

    return (
      <div className="channel-list">
        {channels.map((item) => (
          <div
            className="channel-row"
            key={item.channel}
          >
            <div className="channel-number">
              <span>CH</span>
              <strong>{item.channel}</strong>
            </div>

            <div className="channel-bar-area">
              <div className="channel-bar-track">
                <div
                  className={`channel-bar ${getCongestionClass(
                    item.congestion
                  )}`}
                  style={{
                    width: `${Math.min(
                      item.network_count * 20,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="channel-count">
              <Wifi size={15} />
              {item.network_count}
            </div>

            <div
              className={`congestion-badge ${getCongestionClass(
                item.congestion
              )}`}
            >
              {item.congestion}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="channel-analyzer">
      <div className="channel-header">
        <div>
          <div className="channel-eyebrow">
            <Radio size={15} />
            CHANNEL ANALYSIS
          </div>

          <h2>Wi-Fi Channel Analyzer</h2>

          <p>
            Analyze nearby networks and identify
            channel congestion.
          </p>
        </div>

        <button
          className="channel-scan-button"
          onClick={scanChannels}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={
              loading ? "spinning" : ""
            }
          />

          {loading
            ? "Scanning..."
            : "Scan Channels"}
        </button>
      </div>

      {error && (
        <div className="channel-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {data && !error && (
        <>
          <div className="channel-summary">
            <div className="channel-summary-card">
              <span>Networks Detected</span>
              <strong>
                {data.total_networks}
              </strong>
            </div>

            <div className="channel-summary-card">
              <span>Channels Used</span>
              <strong>
                {data.total_channels}
              </strong>
            </div>

            <div className="channel-summary-card">
              <span>2.4 GHz</span>
              <strong>
                {data.bands["2.4 GHz"].length}
              </strong>
            </div>

            <div className="channel-summary-card">
              <span>5 / 6 GHz</span>
              <strong>
                {data.bands["5/6 GHz"].length}
              </strong>
            </div>
          </div>

          <div className="channel-band-card">
            <div className="channel-card-header">
              <div>
                <h3>2.4 GHz Channels</h3>

                <p>
                  Networks detected on the
                  2.4 GHz band
                </p>
              </div>

              <CheckCircle2 size={20} />
            </div>

            {renderChannels(
              data.bands["2.4 GHz"]
            )}
          </div>

          <div className="channel-band-card">
            <div className="channel-card-header">
              <div>
                <h3>5 / 6 GHz Channels</h3>

                <p>
                  Networks detected on
                  higher-frequency bands
                </p>
              </div>

              <CheckCircle2 size={20} />
            </div>

            {renderChannels(
              data.bands["5/6 GHz"]
            )}
          </div>

          <div className="channel-note">
            <AlertTriangle size={16} />

            <span>
              Congestion is currently estimated
              from the number of detected networks
              on each channel. It does not represent
              actual RF airtime utilization.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default ChannelAnalyzer;