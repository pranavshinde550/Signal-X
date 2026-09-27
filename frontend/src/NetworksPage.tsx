import { useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Wifi,
  ShieldCheck,
  Radio,
  Signal,
  Clock3,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";

import "./NetworksPage.css";
import { SIGNALX_API_BASE } from "./signalxConfig";

interface Network {
  ssid: string | null;
  bssid: string | null;
  signal_percent: number | null;
  rssi_dbm: number | null;
  radio_type: string | null;
  channel: number | null;
  band: string | null;
  authentication: string | null;
  cipher: string | null;
}

interface NetworkScanResponse {
  success: boolean;
  networks: Network[];
  count: number;
  error: string | null;
}

type SortField =
  | "ssid"
  | "signal"
  | "channel"
  | "band";

export default function NetworksPage() {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sortField, setSortField] =
    useState<SortField>("signal");

  const [descending, setDescending] =
    useState(true);

  const scanNetworks = async () => {
    try {
      setScanning(true);
      setError(null);

      const response = await fetch(
        `${SIGNALX_API_BASE}/api/wifi/networks`
      );

      if (!response.ok) {
        throw new Error("Network scan request failed.");
      }

      const data: NetworkScanResponse =
        await response.json();

      if (!data.success) {
        throw new Error(
          data.error || "Wi-Fi scan failed."
        );
      }

      setNetworks(data.networks);
      setLastScan(new Date());

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to scan networks."
      );
    } finally {
      setScanning(false);
    }
  };

  const filteredNetworks = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = networks.filter((network) => {
      if (!query) return true;

      return (
        network.ssid
          ?.toLowerCase()
          .includes(query) ||
        network.bssid
          ?.toLowerCase()
          .includes(query)
      );
    });

    result.sort((a, b) => {
      let value = 0;

      if (sortField === "ssid") {
        value = (a.ssid || "").localeCompare(
          b.ssid || ""
        );
      }

      if (sortField === "signal") {
        value =
          (a.rssi_dbm ?? -999) -
          (b.rssi_dbm ?? -999);
      }

      if (sortField === "channel") {
        value =
          (a.channel ?? 999) -
          (b.channel ?? 999);
      }

      if (sortField === "band") {
        value = (a.band || "").localeCompare(
          b.band || ""
        );
      }

      return descending ? -value : value;
    });

    return result;
  }, [
    networks,
    search,
    sortField,
    descending,
  ]);

  const changeSort = (field: SortField) => {
    if (sortField === field) {
      setDescending((value) => !value);
    } else {
      setSortField(field);
      setDescending(true);
    }
  };

  const signalClass = (rssi: number | null) => {
    if (rssi === null) return "neutral";
    if (rssi >= -50) return "excellent";
    if (rssi >= -60) return "good";
    if (rssi >= -67) return "fair";
    if (rssi >= -75) return "weak";
    return "very-weak";
  };

  const signalLabel = (rssi: number | null) => {
    if (rssi === null) return "N/A";
    if (rssi >= -50) return "Excellent";
    if (rssi >= -60) return "Good";
    if (rssi >= -67) return "Fair";
    if (rssi >= -75) return "Weak";
    return "Very Weak";
  };

  const signalWidth = (
    percent: number | null,
    rssi: number | null
  ) => {
    if (percent !== null) {
      return Math.max(
        5,
        Math.min(100, percent)
      );
    }

    if (rssi === null) return 5;

    return Math.max(
      5,
      Math.min(
        100,
        ((rssi + 100) / 70) * 100
      )
    );
  };

  return (
    <div className="networks-page">

      {/* HEADER */}

      <div className="networks-header">

        <div>
          <span className="page-eyebrow">
            NETWORK DISCOVERY
          </span>

          <h2>Nearby Networks</h2>

          <p>
            Discover Wi-Fi networks detected
            by your local adapter.
          </p>
        </div>

        <button
          className="scan-button"
          onClick={scanNetworks}
          disabled={scanning}
        >
          <RefreshCw
            size={17}
            className={
              scanning
                ? "scan-spinning"
                : ""
            }
          />

          {scanning
            ? "Scanning..."
            : "Scan Networks"}
        </button>

      </div>


      {/* SUMMARY */}

      <div className="network-summary">

        <div className="summary-card">
          <div className="summary-icon">
            <Wifi size={20} />
          </div>

          <div>
            <span>Networks Found</span>
            <strong>{networks.length}</strong>
          </div>
        </div>


        <div className="summary-card">
          <div className="summary-icon">
            <Signal size={20} />
          </div>

          <div>
            <span>Strong Networks</span>

            <strong>
              {
                networks.filter(
                  (network) =>
                    network.rssi_dbm !== null &&
                    network.rssi_dbm >= -60
                ).length
              }
            </strong>
          </div>
        </div>


        <div className="summary-card">
          <div className="summary-icon">
            <Radio size={20} />
          </div>

          <div>
            <span>2.4 GHz</span>

            <strong>
              {
                networks.filter(
                  (network) =>
                    network.band === "2.4 GHz"
                ).length
              }
            </strong>
          </div>
        </div>


        <div className="summary-card">
          <div className="summary-icon">
            <Clock3 size={20} />
          </div>

          <div>
            <span>Last Scan</span>

            <strong>
              {lastScan
                ? lastScan.toLocaleTimeString()
                : "Never"}
            </strong>
          </div>
        </div>

      </div>


      {/* SEARCH */}

      <div className="network-toolbar">

        <div className="search-box">

          <Search size={17} />

          <input
            type="text"
            placeholder="Search SSID or BSSID..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />

        </div>


        <div className="scan-info">

          <span className="scan-dot" />

          Real adapter scan

        </div>

      </div>


      {/* ERROR */}

      {error && (
        <div className="scan-error">

          <AlertCircle size={18} />

          <div>
            <strong>Scan failed</strong>

            <span>{error}</span>
          </div>

        </div>
      )}


      {/* NETWORK TABLE */}

      <div className="network-table-card">

        <div className="table-heading">

          <div>
            <span className="page-eyebrow">
              DETECTED NETWORKS
            </span>

            <h3>Wi-Fi Environment</h3>
          </div>

          <span className="network-count">
            {filteredNetworks.length} visible
          </span>

        </div>


        {networks.length === 0 ? (

          <div className="network-empty">

            <Wifi size={42} />

            <h3>No scan results yet</h3>

            <p>
              Click "Scan Networks" to discover
              nearby Wi-Fi networks.
            </p>

            <button
              className="empty-scan-button"
              onClick={scanNetworks}
              disabled={scanning}
            >
              <RefreshCw size={16} />
              Start Scan
            </button>

          </div>

        ) : filteredNetworks.length === 0 ? (

          <div className="network-empty">

            <Search size={36} />

            <h3>No matching networks</h3>

            <p>
              Try a different SSID or BSSID.
            </p>

          </div>

        ) : (

          <div className="table-wrapper">

            <table>

              <thead>

                <tr>

                  <th>
                    <button
                      className="sort-button"
                      onClick={() =>
                        changeSort("ssid")
                      }
                    >
                      Network
                      <ArrowUpDown size={13} />
                    </button>
                  </th>

                  <th>
                    <button
                      className="sort-button"
                      onClick={() =>
                        changeSort("signal")
                      }
                    >
                      Signal
                      <ArrowUpDown size={13} />
                    </button>
                  </th>

                  <th>
                    <button
                      className="sort-button"
                      onClick={() =>
                        changeSort("band")
                      }
                    >
                      Band
                      <ArrowUpDown size={13} />
                    </button>
                  </th>

                  <th>
                    <button
                      className="sort-button"
                      onClick={() =>
                        changeSort("channel")
                      }
                    >
                      Channel
                      <ArrowUpDown size={13} />
                    </button>
                  </th>

                  <th>Security</th>

                  <th>Radio</th>

                </tr>

              </thead>

              <tbody>

                {filteredNetworks.map(
                  (network, index) => {

                    const className =
                      signalClass(
                        network.rssi_dbm
                      );

                    return (
                      <tr
                        key={`${network.bssid}-${index}`}
                      >

                        <td>

                          <div className="network-name">

                            <div className="network-icon">
                              <Wifi size={17} />
                            </div>

                            <div>

                              <strong>
                                {network.ssid ||
                                  "Hidden Network"}
                              </strong>

                              <small>
                                {network.bssid ||
                                  "BSSID unavailable"}
                              </small>

                            </div>

                          </div>

                        </td>


                        <td>

                          <div className="signal-cell">

                            <div className="signal-bar">

                              <span
                                className={className}
                                style={{
                                  width:
                                    `${signalWidth(
                                      network.signal_percent,
                                      network.rssi_dbm
                                    )}%`,
                                }}
                              />

                            </div>

                            <div>

                              <strong>
                                {network.rssi_dbm !== null
                                  ? `${network.rssi_dbm} dBm`
                                  : "N/A"}
                              </strong>

                              <small>
                                {signalLabel(
                                  network.rssi_dbm
                                )}
                              </small>

                            </div>

                          </div>

                        </td>


                        <td>

                          <span className="band-badge">
                            {network.band ||
                              "Unknown"}
                          </span>

                        </td>


                        <td>

                          <span className="channel-value">
                            {network.channel ??
                              "N/A"}
                          </span>

                        </td>


                        <td>

                          <div className="security-cell">

                            <ShieldCheck size={15} />

                            <span>
                              {network.authentication ||
                                "Unknown"}
                            </span>

                          </div>

                        </td>


                        <td>

                          <span className="radio-value">
                            {network.radio_type ||
                              "N/A"}
                          </span>

                        </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>

          </div>
        )}

      </div>


      <div className="network-footer">

        <span>
          ● Measurements collected locally
          from the Windows Wi-Fi adapter.
        </span>

        <span>
          {lastScan
            ? `Last scan ${lastScan.toLocaleTimeString()}`
            : "No scan performed"}
        </span>

      </div>

    </div>
  );
}