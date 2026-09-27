# Signal-X

### Real-Time Wi-Fi Signal Strength Analyzer for Windows

Signal-X is a Windows-based real-time Wi-Fi analysis application designed to monitor, analyze, and visualize wireless network performance using data collected directly from the local Wi-Fi adapter.

It combines a modern React interface with an Electron desktop application and a Python/FastAPI monitoring engine to provide real-time wireless diagnostics in a single desktop application.

---

## Overview

Signal-X provides a unified interface for understanding the current state and quality of a Wi-Fi connection.

The application collects information directly from the Windows Wi-Fi subsystem and transforms it into useful visualizations and measurements such as:

- Real-time RSSI
- Signal strength
- Nearby Wi-Fi networks
- Channel distribution
- Network performance
- Gateway latency
- Wi-Fi coverage measurements
- GPS-based coverage mapping
- Historical signal measurements
- Live WebSocket telemetry

The application is designed to run locally on Windows so that Wi-Fi information is collected from the user's own wireless adapter.

---

# Key Features

## 📶 Real-Time Wi-Fi Monitoring

Continuously monitors the currently connected Wi-Fi network and displays:

- SSID
- Connection state
- RSSI
- Signal percentage
- Wi-Fi band
- Channel
- Radio technology
- Receive rate
- Transmit rate
- Authentication
- Encryption

The dashboard receives live measurements through a WebSocket connection.

---

## 📡 Nearby Network Scanner

Scans nearby wireless networks using the Windows Wi-Fi subsystem.

The scanner provides information such as:

- SSID
- BSSID
- Signal strength
- Estimated RSSI
- Channel
- Frequency band
- Authentication
- Encryption
- Radio type

Networks can be searched, filtered, and sorted through the interface.

---

## 📊 Channel Analyzer

Analyzes the distribution of detected networks across Wi-Fi channels.

Channels are classified according to the number of detected networks:

| Networks on Channel | Classification |
|---:|---|
| 0–1 | Low |
| 2–3 | Medium |
| 4+ | High |

This provides a quick view of channel-level network density.

> Channel density represents the number of detected networks and should not be interpreted as direct RF airtime utilization.

---

## ⚡ Performance Analyzer

Provides a summary of current Wi-Fi connection performance.

The analyzer uses information obtained from the local Wi-Fi connection and presents it in an easy-to-understand format.

---

## ⏱️ Latency Analyzer

Measures latency to the detected IPv4 default gateway.

Latency is classified as:

| Latency | Classification |
|---:|---|
| < 20 ms | Excellent |
| < 50 ms | Good |
| < 100 ms | Fair |
| ≥ 100 ms | High |

This helps identify local-network responsiveness independently of Internet speed.

---

## 🗺️ Wi-Fi Coverage Mapping

Signal-X can collect Wi-Fi measurements together with GPS coordinates.

Each coverage measurement can contain:

- Latitude
- Longitude
- GPS accuracy
- RSSI
- Signal percentage
- Timestamp
- Channel
- Band
- Signal quality

Measurements are displayed on an interactive map.

---

## 🔥 Signal Heatmap

Coverage measurements are converted into a visual heatmap.

Signal-X uses RSSI ranges to represent signal quality:

| RSSI | Interpretation |
|---:|---|
| ≥ -50 dBm | Very strong |
| -50 to -60 dBm | Strong |
| -60 to -70 dBm | Good |
| -70 to -80 dBm | Moderate |
| -80 to -90 dBm | Weak |
| < -90 dBm | Very weak |

The map provides both individual measurement points and an aggregated heatmap.

---

## 🔴 Live WebSocket Monitoring

The dashboard receives Wi-Fi measurements through:

```text
/ws/live




Design Philosophy

Signal-X follows three primary principles:

1. Real-Time

Measurements should represent the current state of the local wireless connection rather than relying exclusively on historical or simulated values.

2. Local Processing

The Wi-Fi adapter is accessed locally so that the application can analyze the actual wireless environment of the computer running Signal-X.

3. Visual Diagnostics

Raw wireless measurements are transformed into dashboards, charts, classifications, tables, and geographic visualizations that make network behavior easier to understand.

Current Limitations

Signal-X currently focuses on Windows-based Wi-Fi monitoring.

Some measurements have different levels of precision:

Connected-network RSSI is obtained directly from the Windows Wi-Fi interface.
Nearby-network RSSI is estimated from reported signal percentages.
Channel congestion represents detected network density, not RF airtime utilization.
Coverage data depends on the availability and accuracy of location measurements.
Future Scope

Potential future improvements include:

Windows Native WLAN API integration
More detailed BSSID/AP tracking
Roaming detection
Historical data persistence
Advanced RF interference analysis
Signal-quality anomaly detection
Weak-signal zone detection
Network comparison
Exportable coverage reports
CSV/JSON measurement export
Automated diagnostic recommendations
Multi-platform support
