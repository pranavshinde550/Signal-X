import { registerPlugin } from "@capacitor/core";

export interface AndroidWifiInfo {
  connected: boolean;
  ssid?: string;
  bssid?: string;
  authentication?: string;
  cipher?: string;
  rssi_dbm?: number;
  signal_percent?: number;
  frequency_mhz?: number;
  channel?: number;
  band?: string;

  receive_rate_mbps?: number;
  transmit_rate_mbps?: number;
  radio_type?: string;

  gateway?: string;
  latency_ms?: number;
  latency_status?: string;

  message?: string;
}

export interface AndroidWifiNetwork {
  ssid: string | null;
  bssid: string | null;
  signal_percent: number | null;
  rssi_dbm: number | null;
  radio_type: string | null;
  channel: number | null;
  band: string | null;
  authentication: string | null;
  cipher: string | null;
  frequency_mhz?: number | null;
}

export interface AndroidWifiScanResult {
  success: boolean;
  networks: AndroidWifiNetwork[];
  count: number;
  cached?: boolean;
  error?: string | null;
}

export interface AndroidLocationInfo {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  timestamp: number;
  provider: string;
}

interface WifiInfoPlugin {
  getCurrentWifi(): Promise<AndroidWifiInfo>;
  scanNetworks(): Promise<AndroidWifiScanResult>;
  getCurrentLocation(): Promise<AndroidLocationInfo>;
}

export const WifiInfo =
  registerPlugin<WifiInfoPlugin>("WifiInfo");
