package com.signalx.app.plugins;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Handler;
import android.os.Looper;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.TransportInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(
    name = "WifiInfo",
    permissions = {
        @Permission(
            alias = "nearbyWifi",
            strings = {
                Manifest.permission.NEARBY_WIFI_DEVICES
            }
        ),
        @Permission(
            alias = "wifiLocation",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION
            }
        ),
        @Permission(
            alias = "deviceLocation",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class WifiInfoPlugin extends Plugin {

    private static final String TAG = "Signal-X";

    private BroadcastReceiver scanReceiver;
    private PluginCall pendingScanCall;

    /*
     * Stores which operation originally requested permissions.
     *
     * This is important because the permission callback can happen
     * before performWifiScan() has been reached.
     */
    private String pendingPermissionOperation = null;

    // ============================================================
    // CURRENT WIFI
    // ============================================================

    @PluginMethod
    public void getCurrentWifi(PluginCall call) {
        ensureWifiPermissions(call, "current");
    }

    // ============================================================
    // WIFI SCAN
    // ============================================================

    @PluginMethod
    public void scanNetworks(PluginCall call) {
        ensureWifiPermissions(call, "scan");
    }

    // ============================================================
    // CURRENT DEVICE LOCATION
    // ============================================================

    @PluginMethod
    public void getCurrentLocation(PluginCall call) {

        Context context = getContext();

        boolean fineGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;

        boolean coarseGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;

        if (!fineGranted && !coarseGranted) {
            requestPermissionForAlias(
                "deviceLocation",
                call,
                "locationPermissionCallback"
            );
            return;
        }

        readCurrentLocation(call);
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {

        Context context = getContext();

        boolean fineGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;

        boolean coarseGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;

        if (!fineGranted && !coarseGranted) {
            call.reject(
                "Location permission is required for Wi-Fi coverage mapping."
            );
            return;
        }

        readCurrentLocation(call);
    }

    private void readCurrentLocation(PluginCall call) {

        final Context context = getContext();

        final boolean fineGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;

        final boolean coarseGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;

        if (!fineGranted && !coarseGranted) {
            call.reject("Location permission is not granted.");
            return;
        }

        try {
            LocationManager locationManager =
                (LocationManager) context.getSystemService(
                    Context.LOCATION_SERVICE
                );

            if (locationManager == null) {
                call.reject("LocationManager is unavailable.");
                return;
            }

            boolean gpsEnabled =
                locationManager.isProviderEnabled(
                    LocationManager.GPS_PROVIDER
                );

            boolean networkEnabled =
                locationManager.isProviderEnabled(
                    LocationManager.NETWORK_PROVIDER
                );

            if (!gpsEnabled && !networkEnabled) {
                call.reject(
                    "Location services are turned off. Please turn on Location in Android Settings."
                );
                return;
            }

            Location bestLastKnown = null;

            if (fineGranted || coarseGranted) {
                if (gpsEnabled) {
                    try {
                        bestLastKnown = locationManager.getLastKnownLocation(
                            LocationManager.GPS_PROVIDER
                        );
                    } catch (SecurityException ignored) {
                    }
                }

                if (bestLastKnown == null && networkEnabled) {
                    try {
                        bestLastKnown = locationManager.getLastKnownLocation(
                            LocationManager.NETWORK_PROVIDER
                        );
                    } catch (SecurityException ignored) {
                    }
                }
            }

            if (bestLastKnown != null) {
                resolveLocation(call, bestLastKnown);
                return;
            }

            final boolean[] locationResolved = { false };

            final LocationListener listener = new LocationListener() {

                private void finish(Location location) {
                    if (locationResolved[0] || location == null) {
                        return;
                    }

                    locationResolved[0] = true;

                    try {
                        locationManager.removeUpdates(this);
                    } catch (Exception ignored) {
                    }

                    resolveLocation(call, location);
                }

                @Override
                public void onLocationChanged(Location location) {
                    finish(location);
                }

                @Override
                public void onProviderEnabled(String provider) {
                }

                @Override
                public void onProviderDisabled(String provider) {
                }
            };

            boolean requested = false;

            if (gpsEnabled) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    0L,
                    0f,
                    listener,
                    Looper.getMainLooper()
                );
                requested = true;
            }

            if (networkEnabled) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    0L,
                    0f,
                    listener,
                    Looper.getMainLooper()
                );
                requested = true;
            }

            if (!requested) {
                call.reject("Unable to start Android location updates.");
                return;
            }

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (locationResolved[0]) {
                    return;
                }

                locationResolved[0] = true;

                try {
                    locationManager.removeUpdates(listener);
                } catch (Exception ignored) {
                }

                call.reject(
                    "Unable to obtain a current device location. Please keep Location enabled and try again."
                );
            }, 15000L);

        } catch (SecurityException e) {
            call.reject(
                "Android denied location access: " + e.getMessage()
            );
        } catch (Exception e) {
            Log.e(TAG, "Native location read failed", e);
            call.reject(
                "Unable to read device location: " + e.getMessage()
            );
        }
    }

    private void resolveLocation(PluginCall call, Location location) {

        JSObject result = new JSObject();

        result.put("latitude", location.getLatitude());
        result.put("longitude", location.getLongitude());
        result.put("accuracy_m", location.hasAccuracy() ? location.getAccuracy() : -1);
        result.put("timestamp", location.getTime());
        result.put("provider", location.getProvider() == null ? "unknown" : location.getProvider());

        call.resolve(result);
    }

    // ============================================================
    // PERMISSION HANDLING
    // ============================================================

    private void ensureWifiPermissions(
        PluginCall call,
        String operation
    ) {

        pendingPermissionOperation = operation;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {

            boolean nearbyGranted =
                getPermissionState("nearbyWifi")
                    == PermissionState.GRANTED;

            boolean locationGranted =
                getPermissionState("wifiLocation")
                    == PermissionState.GRANTED;

            if (!locationGranted) {

                requestPermissionForAlias(
                    "wifiLocation",
                    call,
                    "wifiPermissionCallback"
                );

                return;
            }

            if (!nearbyGranted) {

                requestPermissionForAlias(
                    "nearbyWifi",
                    call,
                    "wifiPermissionCallback"
                );

                return;
            }

        } else {

            if (
                getPermissionState("wifiLocation")
                    != PermissionState.GRANTED
            ) {

                requestPermissionForAlias(
                    "wifiLocation",
                    call,
                    "wifiPermissionCallback"
                );

                return;
            }
        }

        continuePermissionOperation(call);
    }

    @PermissionCallback
    private void wifiPermissionCallback(PluginCall call) {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {

            boolean nearbyGranted =
                getPermissionState("nearbyWifi")
                    == PermissionState.GRANTED;

            boolean locationGranted =
                getPermissionState("wifiLocation")
                    == PermissionState.GRANTED;

            if (!locationGranted) {

                pendingPermissionOperation = null;

                call.reject(
                    "Location permission is required for Wi-Fi access."
                );

                return;
            }

            if (!nearbyGranted) {

                pendingPermissionOperation = null;

                call.reject(
                    "Nearby Wi-Fi permission is required."
                );

                return;
            }

        } else {

            if (
                getPermissionState("wifiLocation")
                    != PermissionState.GRANTED
            ) {

                pendingPermissionOperation = null;

                call.reject(
                    "Location permission is required for Wi-Fi access."
                );

                return;
            }
        }

        continuePermissionOperation(call);
    }

    private void continuePermissionOperation(PluginCall call) {

        String operation = pendingPermissionOperation;

        pendingPermissionOperation = null;

        if ("scan".equals(operation)) {

            performWifiScan(call);

        } else {

            readCurrentWifi(call);
        }
    }

    // ============================================================
    // CURRENT WIFI INFORMATION
    // ============================================================

    private void readCurrentWifi(PluginCall call) {

        try {

            Context context = getContext();

            if (
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) != PackageManager.PERMISSION_GRANTED
            ) {

                call.reject(
                    "ACCESS_FINE_LOCATION permission is not granted."
                );

                return;
            }

            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.NEARBY_WIFI_DEVICES
                ) != PackageManager.PERMISSION_GRANTED
            ) {

                call.reject(
                    "NEARBY_WIFI_DEVICES permission is not granted."
                );

                return;
            }

            ConnectivityManager connectivityManager =
                (ConnectivityManager)
                    context.getSystemService(
                        Context.CONNECTIVITY_SERVICE
                    );

            if (connectivityManager == null) {

                call.reject(
                    "ConnectivityManager is unavailable."
                );

                return;
            }

            Network activeNetwork =
                connectivityManager.getActiveNetwork();

            if (activeNetwork == null) {

                JSObject result = new JSObject();

                result.put("connected", false);
                result.put(
                    "message",
                    "No active network connection."
                );

                call.resolve(result);

                return;
            }

            NetworkCapabilities capabilities =
                connectivityManager.getNetworkCapabilities(
                    activeNetwork
                );

            if (capabilities == null) {

                JSObject result = new JSObject();

                result.put("connected", false);
                result.put(
                    "message",
                    "Network information is unavailable."
                );

                call.resolve(result);

                return;
            }

            if (
                !capabilities.hasTransport(
                    NetworkCapabilities.TRANSPORT_WIFI
                )
            ) {

                JSObject result = new JSObject();

                result.put(
                    "connected",
                    false
                );

                result.put(
                    "message",
                    "Device is not connected through Wi-Fi."
                );

                call.resolve(result);

                return;
            }

            TransportInfo transportInfo =
                capabilities.getTransportInfo();

            if (!(transportInfo instanceof WifiInfo)) {

                call.reject(
                    "Connected Wi-Fi information is unavailable."
                );

                return;
            }

            WifiInfo wifiInfo =
                (WifiInfo) transportInfo;

            int rssi =
                wifiInfo.getRssi();

            int frequency =
                wifiInfo.getFrequency();

            String ssid =
                wifiInfo.getSSID();

            /*
             * On some Android/Xiaomi devices, the modern WifiInfo
             * object can return an unknown or empty SSID even when
             * the device is actively connected.
             *
             * Use the legacy connection-info API only as an SSID
             * fallback. The modern WifiInfo object remains the
             * primary source for all other Wi-Fi information.
             */
            if (
                ssid == null ||
                ssid.equals("<unknown ssid>") ||
                ssid.trim().isEmpty()
            ) {

                try {

                    WifiManager wifiManager =
                        (WifiManager)
                            context.getApplicationContext()
                                .getSystemService(
                                    Context.WIFI_SERVICE
                                );

                    if (wifiManager != null) {

                        WifiInfo fallbackWifiInfo =
                            wifiManager.getConnectionInfo();

                        if (fallbackWifiInfo != null) {

                            String fallbackSsid =
                                fallbackWifiInfo.getSSID();

                            if (
                                fallbackSsid != null &&
                                !fallbackSsid.equals("<unknown ssid>") &&
                                !fallbackSsid.trim().isEmpty()
                            ) {

                                ssid = fallbackSsid;
                            }
                        }
                    }

                } catch (Exception e) {

                    Log.w(
                        TAG,
                        "Unable to obtain fallback Wi-Fi SSID.",
                        e
                    );
                }
            }

            if (
                ssid == null ||
                ssid.equals("<unknown ssid>")
            ) {

                ssid = "";
            }

            if (
                ssid.length() >= 2 &&
                ssid.startsWith("\"") &&
                ssid.endsWith("\"")
            ) {

                ssid =
                    ssid.substring(
                        1,
                        ssid.length() - 1
                    );
            }

            String bssid =
                wifiInfo.getBSSID();

            String authentication =
                getConnectedAuthentication(wifiInfo);

            String cipher =
                "Unknown";

            /*
             * Android 12+ exposes the security type directly through
             * WifiInfo. Cipher information is not exposed by WifiInfo,
             * so use the latest scan metadata when available.
             *
             * Some Xiaomi/Android builds redact the connected BSSID.
             * Therefore the scan lookup uses exact BSSID first and
             * then falls back to the same frequency with the closest
             * RSSI. No security value is fabricated if no scan result
             * can be matched.
             */
            try {

                WifiManager wifiManager =
                    (WifiManager)
                        context.getApplicationContext()
                            .getSystemService(
                                Context.WIFI_SERVICE
                            );

                if (wifiManager != null) {

                    List<ScanResult> cachedResults =
                        wifiManager.getScanResults();

                    ScanResult matchedScan = null;

                    if (cachedResults != null) {

                        if (
                            bssid != null &&
                            !bssid.trim().isEmpty() &&
                            !"02:00:00:00:00:00".equalsIgnoreCase(bssid)
                        ) {

                            for (ScanResult scan : cachedResults) {

                                if (scan == null || scan.BSSID == null) {
                                    continue;
                                }

                                if (bssid.equalsIgnoreCase(scan.BSSID)) {
                                    matchedScan = scan;
                                    break;
                                }
                            }
                        }

                        if (matchedScan == null) {

                            int bestDifference = Integer.MAX_VALUE;

                            for (ScanResult scan : cachedResults) {

                                if (scan == null || scan.frequency != frequency) {
                                    continue;
                                }

                                int difference = Math.abs(scan.level - rssi);

                                if (difference < bestDifference) {
                                    bestDifference = difference;
                                    matchedScan = scan;
                                }
                            }
                        }
                    }

                    if (matchedScan != null) {

                        if (
                            (ssid == null || ssid.trim().isEmpty()) &&
                            matchedScan.SSID != null &&
                            !matchedScan.SSID.trim().isEmpty()
                        ) {
                            ssid = matchedScan.SSID;
                        }

                        if (
                            authentication == null ||
                            authentication.equals("Unknown")
                        ) {
                            authentication =
                                getAuthentication(matchedScan.capabilities);
                        }

                        String scanCipher =
                            getCipher(matchedScan.capabilities);

                        if (
                            scanCipher != null &&
                            !scanCipher.equals("Unknown")
                        ) {
                            cipher = scanCipher;
                        }
                    }
                }

            } catch (SecurityException e) {

                Log.w(
                    TAG,
                    "Unable to read cached Wi-Fi metadata.",
                    e
                );

            } catch (Exception e) {

                Log.w(
                    TAG,
                    "Unable to match connected Wi-Fi scan metadata.",
                    e
                );
            }

            int signalPercent =
                calculateSignalPercent(rssi);

            int rxLinkSpeed =
                getRxLinkSpeed(wifiInfo);

            int txLinkSpeed =
                getTxLinkSpeed(wifiInfo);

            String radioType =
                getConnectedRadioType(wifiInfo);

            String gateway =
                getDefaultGateway(
                    connectivityManager,
                    activeNetwork
                );

            JSObject result =
                new JSObject();

            result.put(
                "connected",
                true
            );

            result.put(
                "ssid",
                ssid
            );

            result.put(
                "bssid",
                bssid
            );

            result.put(
                "authentication",
                authentication
            );

            result.put(
                "cipher",
                cipher
            );

            result.put(
                "rssi_dbm",
                rssi
            );

            result.put(
                "signal_percent",
                signalPercent
            );

            result.put(
                "frequency_mhz",
                frequency
            );

            result.put(
                "channel",
                frequencyToChannel(frequency)
            );

            result.put(
                "band",
                getBand(frequency)
            );

            /*
             * Android WifiInfo reports these as actual
             * current link speeds in Mbps.
             */
            result.put(
                "receive_rate_mbps",
                rxLinkSpeed
            );

            result.put(
                "transmit_rate_mbps",
                txLinkSpeed
            );

            result.put(
                "radio_type",
                radioType
            );

            result.put(
                "gateway",
                gateway
            );

            /*
             * Gateway latency is measured asynchronously so
             * the Capacitor bridge is not blocked while waiting
             * for the reachability test.
             */
            measureGatewayLatency(
                activeNetwork,
                gateway,
                result,
                call
            );

        } catch (SecurityException e) {

            Log.e(
                TAG,
                "Wi-Fi SecurityException",
                e
            );

            call.reject(
                "Android denied Wi-Fi access: " +
                e.getMessage()
            );

        } catch (Exception e) {

            Log.e(
                TAG,
                "Wi-Fi read exception",
                e
            );

            call.reject(
                "Unable to read Wi-Fi information: " +
                e.getMessage()
            );
        }
    }

    private String getConnectedAuthentication(
        WifiInfo wifiInfo
    ) {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {

            try {

                int securityType =
                    wifiInfo.getCurrentSecurityType();

                switch (securityType) {

                    case WifiInfo.SECURITY_TYPE_OPEN:
                        return "Open";

                    case WifiInfo.SECURITY_TYPE_WEP:
                        return "WEP";

                    case WifiInfo.SECURITY_TYPE_PSK:
                        return "WPA2-Personal";

                    case WifiInfo.SECURITY_TYPE_SAE:
                        return "WPA3-Personal";

                    case WifiInfo.SECURITY_TYPE_EAP:
                        return "WPA/WPA2-Enterprise";

                    case WifiInfo.SECURITY_TYPE_EAP_WPA3_ENTERPRISE:
                    case WifiInfo.SECURITY_TYPE_EAP_WPA3_ENTERPRISE_192_BIT:
                        return "WPA3-Enterprise";

                    case WifiInfo.SECURITY_TYPE_OWE:
                        return "OWE";

                    case WifiInfo.SECURITY_TYPE_WAPI_PSK:
                        return "WAPI-PSK";

                    case WifiInfo.SECURITY_TYPE_WAPI_CERT:
                        return "WAPI-Certificate";

                    case WifiInfo.SECURITY_TYPE_DPP:
                        return "DPP";

                    case WifiInfo.SECURITY_TYPE_PASSPOINT_R1_R2:
                    case WifiInfo.SECURITY_TYPE_PASSPOINT_R3:
                        return "Passpoint";

                    default:
                        return "Unknown";
                }

            } catch (Exception e) {

                Log.w(
                    TAG,
                    "Unable to read current Wi-Fi security type.",
                    e
                );
            }
        }

        return "Unknown";
    }

    // ============================================================
    // LINK SPEED
    // ============================================================

    private int getRxLinkSpeed(WifiInfo wifiInfo) {

        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.Q
        ) {

            int value =
                wifiInfo.getRxLinkSpeedMbps();

            if (
                value != WifiInfo.LINK_SPEED_UNKNOWN &&
                value >= 0
            ) {

                return value;
            }
        }

        return -1;
    }

    private int getTxLinkSpeed(WifiInfo wifiInfo) {

        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.Q
        ) {

            int value =
                wifiInfo.getTxLinkSpeedMbps();

            if (
                value != WifiInfo.LINK_SPEED_UNKNOWN &&
                value >= 0
            ) {

                return value;
            }
        }

        return -1;
    }

    // ============================================================
    // CONNECTED RADIO TYPE
    // ============================================================

    private String getConnectedRadioType(
        WifiInfo wifiInfo
    ) {

        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.R
        ) {

            try {

                int standard =
                    wifiInfo.getWifiStandard();

                switch (standard) {

                    case ScanResult.WIFI_STANDARD_LEGACY:
                        return "802.11a/b/g";

                    case ScanResult.WIFI_STANDARD_11N:
                        return "802.11n";

                    case ScanResult.WIFI_STANDARD_11AC:
                        return "802.11ac";

                    case ScanResult.WIFI_STANDARD_11AX:
                        return "802.11ax";

                    case ScanResult.WIFI_STANDARD_11AD:
                        return "802.11ad";

                    case ScanResult.WIFI_STANDARD_11BE:
                        return "802.11be";

                    default:
                        break;
                }

            } catch (Exception ignored) {
                // Fall back to frequency below.
            }
        }

        int frequency =
            wifiInfo.getFrequency();

        if (
            frequency >= 2400 &&
            frequency < 2500
        ) {

            return "2.4 GHz Wi-Fi";
        }

        if (
            frequency >= 4900 &&
            frequency < 5925
        ) {

            return "5 GHz Wi-Fi";
        }

        if (
            frequency >= 5925 &&
            frequency <= 7125
        ) {

            return "6 GHz Wi-Fi";
        }

        return "Wi-Fi";
    }

    // ============================================================
    // DEFAULT GATEWAY
    // ============================================================

    private String getDefaultGateway(
        ConnectivityManager connectivityManager,
        Network network
    ) {

        try {

            LinkProperties linkProperties =
                connectivityManager.getLinkProperties(
                    network
                );

            if (linkProperties == null) {
                return null;
            }

            for (
                RouteInfo route :
                linkProperties.getRoutes()
            ) {

                if (
                    route.isDefaultRoute() &&
                    route.getGateway() != null
                ) {

                    InetAddress gateway =
                        route.getGateway();

                    if (
                        gateway.isAnyLocalAddress()
                    ) {
                        continue;
                    }

                    return gateway.getHostAddress();
                }
            }

        } catch (Exception e) {

            Log.w(
                TAG,
                "Unable to determine default gateway.",
                e
            );
        }

        return null;
    }

    // ============================================================
    // GATEWAY LATENCY
    // ============================================================

    private void measureGatewayLatency(
        Network network,
        String gateway,
        JSObject result,
        PluginCall call
    ) {

        if (
            gateway == null ||
            gateway.trim().isEmpty()
        ) {

            result.put(
                "latency_ms",
                JSONObjectNull()
            );

            call.resolve(result);

            return;
        }

        new Thread(
            () -> {

                long start =
                    System.nanoTime();

                boolean reachable = false;

                try {

                    InetAddress address =
                        InetAddress.getByName(
                            gateway
                        );

                    NetworkInterface networkInterface =
                        getNetworkInterfaceForNetwork(
                            network
                        );

                    if (
                        networkInterface != null
                    ) {

                        reachable =
                            address.isReachable(
                                networkInterface,
                                1,
                                1000
                            );

                    } else {

                        reachable =
                            address.isReachable(
                                1000
                            );
                    }

                } catch (Exception e) {

                    Log.w(
                        TAG,
                        "Gateway latency test failed.",
                        e
                    );
                }

                long elapsedNanos =
                    System.nanoTime() - start;

                long elapsedMs =
                    Math.max(
                        0,
                        Math.round(
                            elapsedNanos / 1_000_000.0
                        )
                    );

                if (reachable) {

                    result.put(
                        "latency_ms",
                        elapsedMs
                    );

                    result.put(
                        "latency_status",
                        getLatencyStatus(
                            elapsedMs
                        )

                    );

                } else {

                    result.put(
                        "latency_ms",
                        JSONObjectNull()
                    );

                    result.put(
                        "latency_status",
                        "Unavailable"
                    );
                }

                call.resolve(result);

            }
        ).start();
    }

    private NetworkInterface getNetworkInterfaceForNetwork(
        Network network
    ) {

        try {

            ConnectivityManager connectivityManager =
                (ConnectivityManager)
                    getContext().getSystemService(
                        Context.CONNECTIVITY_SERVICE
                    );

            if (connectivityManager == null) {
                return null;
            }

            LinkProperties linkProperties =
                connectivityManager.getLinkProperties(
                    network
                );

            if (linkProperties == null) {
                return null;
            }

            String interfaceName =
                linkProperties.getInterfaceName();

            if (
                interfaceName == null ||
                interfaceName.trim().isEmpty()
            ) {
                return null;
            }

            return NetworkInterface.getByName(
                interfaceName
            );

        } catch (Exception e) {

            Log.w(
                TAG,
                "Unable to determine Wi-Fi network interface.",
                e
            );

            return null;
        }
    }

    private String getLatencyStatus(
        long latency
    ) {

        if (latency < 20) {
            return "Excellent";
        }

        if (latency < 50) {
            return "Good";
        }

        if (latency < 100) {
            return "Fair";
        }

        return "High";
    }

    // ============================================================
    // WIFI SCANNING
    // ============================================================

    private void performWifiScan(PluginCall call) {

        try {

            Context context = getContext();

            if (
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) != PackageManager.PERMISSION_GRANTED
            ) {

                call.reject(
                    "Location permission is required for Wi-Fi scanning."
                );

                return;
            }

            WifiManager wifiManager =
                (WifiManager)
                    context.getApplicationContext()
                        .getSystemService(
                            Context.WIFI_SERVICE
                        );

            if (wifiManager == null) {

                call.reject(
                    "WifiManager is unavailable."
                );

                return;
            }

            if (!wifiManager.isWifiEnabled()) {

                call.reject(
                    "Wi-Fi is turned off on this device."
                );

                return;
            }

            if (!isLocationEnabled()) {

                call.reject(
                    "Location services are turned off. " +
                    "Please turn on Location in Android Settings " +
                    "to scan nearby Wi-Fi networks."
                );

                return;
            }

            if (pendingScanCall != null) {

                call.reject(
                    "A Wi-Fi scan is already running."
                );

                return;
            }

            pendingScanCall = call;

            registerScanReceiver(
                wifiManager
            );

            boolean started =
                wifiManager.startScan();

            if (!started) {

                Log.w(
                    TAG,
                    "Wi-Fi startScan() returned false. " +
                    "Trying latest available results."
                );

                List<ScanResult> results =
                    wifiManager.getScanResults();

                if (
                    results != null &&
                    !results.isEmpty()
                ) {

                    resolveScan(
                        call,
                        results,
                        true
                    );

                    return;
                }

                cleanupScanReceiver();

                pendingScanCall = null;

                call.reject(
                    "Wi-Fi scan could not start. " +
                    "Android may be throttling Wi-Fi scans."
                );
            }

        } catch (SecurityException e) {

            cleanupScanReceiver();
            pendingScanCall = null;

            Log.e(
                TAG,
                "Wi-Fi scan SecurityException",
                e
            );

            call.reject(
                "Android denied Wi-Fi scan access: " +
                e.getMessage()
            );

        } catch (Exception e) {

            cleanupScanReceiver();
            pendingScanCall = null;

            Log.e(
                TAG,
                "Wi-Fi scan exception",
                e
            );

            call.reject(
                "Unable to scan Wi-Fi networks: " +
                e.getMessage()
            );
        }
    }

    private void registerScanReceiver(
        WifiManager wifiManager
    ) {

        cleanupScanReceiver();

        scanReceiver =
            new BroadcastReceiver() {

                @Override
                public void onReceive(
                    Context context,
                    Intent intent
                ) {

                    if (
                        !WifiManager
                            .SCAN_RESULTS_AVAILABLE_ACTION
                            .equals(intent.getAction())
                    ) {
                        return;
                    }

                    boolean updated =
                        intent.getBooleanExtra(
                            WifiManager.EXTRA_RESULTS_UPDATED,
                            false
                        );

                    try {

                        List<ScanResult> results =
                            wifiManager.getScanResults();

                        PluginCall call =
                            pendingScanCall;

                        if (call == null) {
                            return;
                        }

                        if (
                            results == null ||
                            results.isEmpty()
                        ) {

                            cleanupScanReceiver();
                            pendingScanCall = null;

                            call.reject(
                                updated
                                    ? "Wi-Fi scan completed but no networks were found."
                                    : "Wi-Fi scan failed."
                            );

                            return;
                        }

                        resolveScan(
                            call,
                            results,
                            !updated
                        );

                    } catch (SecurityException e) {

                        PluginCall call =
                            pendingScanCall;

                        cleanupScanReceiver();
                        pendingScanCall = null;

                        if (call != null) {

                            call.reject(
                                "Android denied Wi-Fi scan access: " +
                                e.getMessage()
                            );
                        }

                    } catch (Exception e) {

                        PluginCall call =
                            pendingScanCall;

                        cleanupScanReceiver();
                        pendingScanCall = null;

                        if (call != null) {

                            call.reject(
                                "Unable to read Wi-Fi scan results: " +
                                e.getMessage()
                            );
                        }
                    }
                }
            };

        IntentFilter filter =
            new IntentFilter(
                WifiManager.SCAN_RESULTS_AVAILABLE_ACTION
            );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {

            ContextCompat.registerReceiver(
                getContext(),
                scanReceiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED
            );

        } else {

            getContext().registerReceiver(
                scanReceiver,
                filter
            );
        }
    }

    private void resolveScan(
        PluginCall call,
        List<ScanResult> results,
        boolean cached
    ) {

        try {

            JSObject response =
                new JSObject();

            List<ScanResult> sorted =
                new ArrayList<>(results);

            Collections.sort(
                sorted,
                new Comparator<ScanResult>() {

                    @Override
                    public int compare(
                        ScanResult a,
                        ScanResult b
                    ) {

                        return Integer.compare(
                            b.level,
                            a.level
                        );
                    }
                }
            );

            JSArray networks =
                new JSArray();

            Set<String> seen =
                new HashSet<>();

            for (ScanResult scan : sorted) {

                String bssid =
                    scan.BSSID;

                if (
                    bssid == null ||
                    bssid.trim().isEmpty()
                ) {

                    continue;
                }

                String uniqueKey =
                    bssid.toLowerCase(
                        Locale.US
                    );

                if (seen.contains(uniqueKey)) {
                    continue;
                }

                seen.add(uniqueKey);

                JSObject network =
                    new JSObject();

                String ssid =
                    scan.SSID;

                if (
                    ssid == null ||
                    ssid.trim().isEmpty()
                ) {

                    ssid = null;
                }

                int rssi =
                    scan.level;

                int signalPercent =
                    calculateSignalPercent(
                        rssi
                    );

                int frequency =
                    scan.frequency;

                network.put(
                    "ssid",
                    ssid
                );

                network.put(
                    "bssid",
                    bssid
                );

                network.put(
                    "signal_percent",
                    signalPercent
                );

                network.put(
                    "rssi_dbm",
                    rssi
                );

                network.put(
                    "channel",
                    frequencyToChannel(
                        frequency
                    )
                );

                network.put(
                    "band",
                    getBand(
                        frequency
                    )
                );

                network.put(
                    "frequency_mhz",
                    frequency
                );

                network.put(
                    "authentication",
                    getAuthentication(
                        scan.capabilities
                    )
                );

                network.put(
                    "cipher",
                    getCipher(
                        scan.capabilities
                    )
                );

                network.put(
                    "radio_type",
                    getRadioType(
                        scan
                    )
                );

                networks.put(network);
            }

            response.put(
                "success",
                true
            );

            response.put(
                "count",
                networks.length()
            );

            response.put(
                "networks",
                networks
            );

            response.put(
                "cached",
                cached
            );

            response.put(
                "error",
                JSONObjectNull()
            );

            Log.i(
                TAG,
                "Signal-X scan results: " +
                networks.length() +
                " networks, cached=" +
                cached
            );

            cleanupScanReceiver();

            pendingScanCall = null;

            call.resolve(response);

        } catch (Exception e) {

            cleanupScanReceiver();
            pendingScanCall = null;

            Log.e(
                TAG,
                "Unable to process Wi-Fi scan results",
                e
            );

            call.reject(
                "Unable to process Wi-Fi scan results: " +
                e.getMessage()
            );
        }
    }

    // ============================================================
    // SECURITY / RADIO PARSING
    // ============================================================

    private String getAuthentication(
        String capabilities
    ) {

        if (capabilities == null) {
            return "Unknown";
        }

        String caps =
            capabilities.toUpperCase(
                Locale.US
            );

        if (caps.contains("SAE")) {
            return "WPA3-Personal";
        }

        if (
            caps.contains("WPA2") ||
            caps.contains("RSN")
        ) {
            return "WPA2-Personal";
        }

        if (caps.contains("WPA")) {
            return "WPA";
        }

        if (caps.contains("WEP")) {
            return "WEP";
        }

        if (caps.contains("EAP")) {
            return "WPA/WPA2-Enterprise";
        }

        return "Open";
    }

    private String getCipher(
        String capabilities
    ) {

        if (capabilities == null) {
            return "Unknown";
        }

        String caps =
            capabilities.toUpperCase(
                Locale.US
            );

        if (
            caps.contains("CCMP") ||
            caps.contains("AES")
        ) {
            return "CCMP";
        }

        if (caps.contains("TKIP")) {
            return "TKIP";
        }

        if (caps.contains("WEP")) {
            return "WEP";
        }

        return "None";
    }

    private String getRadioType(
        ScanResult scan
    ) {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {

            try {

                int standard =
                    scan.getWifiStandard();

                switch (standard) {

                    case ScanResult.WIFI_STANDARD_LEGACY:
                        return "802.11a/b/g";

                    case ScanResult.WIFI_STANDARD_11N:
                        return "802.11n";

                    case ScanResult.WIFI_STANDARD_11AC:
                        return "802.11ac";

                    case ScanResult.WIFI_STANDARD_11AX:
                        return "802.11ax";

                    case ScanResult.WIFI_STANDARD_11AD:
                        return "802.11ad";

                    case ScanResult.WIFI_STANDARD_11BE:
                        return "802.11be";

                    default:
                        break;
                }

            } catch (Exception ignored) {
                // Fall back to frequency below.
            }
        }

        int frequency =
            scan.frequency;

        if (
            frequency >= 2400 &&
            frequency < 2500
        ) {
            return "2.4 GHz Wi-Fi";
        }

        if (
            frequency >= 4900 &&
            frequency < 5925
        ) {
            return "5 GHz Wi-Fi";
        }

        if (
            frequency >= 5925 &&
            frequency <= 7125
        ) {
            return "6 GHz Wi-Fi";
        }

        return "Wi-Fi";
    }

    // ============================================================
    // LOCATION SERVICE
    // ============================================================

    private boolean isLocationEnabled() {

        try {

            LocationManager locationManager =
                (LocationManager)
                    getContext()
                        .getSystemService(
                            Context.LOCATION_SERVICE
                        );

            if (locationManager == null) {
                return false;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {

                return locationManager.isLocationEnabled();
            }

            return true;

        } catch (Exception e) {

            return false;
        }
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    private void cleanupScanReceiver() {

        if (scanReceiver == null) {
            return;
        }

        try {

            getContext().unregisterReceiver(
                scanReceiver
            );

        } catch (Exception ignored) {
        }

        scanReceiver = null;
    }

    @Override
    protected void handleOnDestroy() {

        cleanupScanReceiver();

        if (pendingScanCall != null) {

            try {

                pendingScanCall.reject(
                    "Signal-X Wi-Fi scanner was closed."
                );

            } catch (Exception ignored) {
            }

            pendingScanCall = null;
        }

        pendingPermissionOperation = null;

        super.handleOnDestroy();
    }

    // ============================================================
    // HELPERS
    // ============================================================

    private int calculateSignalPercent(
        int rssi
    ) {

        if (rssi <= -100) {
            return 0;
        }

        if (rssi >= -50) {
            return 100;
        }

        return (int) Math.round(
            2.0 * (rssi + 100)
        );
    }

    private String getBand(
        int frequency
    ) {

        if (
            frequency >= 2400 &&
            frequency < 2500
        ) {
            return "2.4 GHz";
        }

        if (
            frequency >= 4900 &&
            frequency < 5925
        ) {
            return "5 GHz";
        }

        if (
            frequency >= 5925 &&
            frequency <= 7125
        ) {
            return "6 GHz";
        }

        return "Unknown";
    }

    private int frequencyToChannel(
        int frequency
    ) {

        if (
            frequency >= 2412 &&
            frequency <= 2484
        ) {

            if (frequency == 2484) {
                return 14;
            }

            return (
                frequency - 2407
            ) / 5;
        }

        if (
            frequency >= 5000 &&
            frequency <= 5900
        ) {

            return (
                frequency - 5000
            ) / 5;
        }

        if (
            frequency >= 5955 &&
            frequency <= 7115
        ) {

            return (
                frequency - 5950
            ) / 5;
        }

        return 0;
    }

    private Object JSONObjectNull() {
        return null;
    }
}