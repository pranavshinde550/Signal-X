from datetime import datetime, timezone
from typing import Any

from app.collectors.wifi_collector import get_wifi_info
from app.collectors.coverage_store import add_measurement


def collect_coverage_point() -> dict[str, Any]:
    """
    Capture one real Wi-Fi measurement and store it.

    No coordinates are generated here. Location information
    will be attached later by the frontend/mapping layer.
    """

    wifi = get_wifi_info()

    if not wifi.get("connected", False):
        return {
            "success": False,
            "measurement": None,
            "error": wifi.get(
                "error",
                "No active Wi-Fi connection.",
            ),
        }

    measurement = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ssid": wifi.get("ssid"),
        "bssid": wifi.get("bssid"),
        "signal_percent": wifi.get("signal_percent"),
        "rssi_dbm": wifi.get("rssi_dbm"),
        "channel": wifi.get("channel"),
        "band": wifi.get("band"),
        "receive_rate_mbps": wifi.get("receive_rate_mbps"),
        "transmit_rate_mbps": wifi.get("transmit_rate_mbps"),
    }

    add_measurement(measurement)

    return {
        "success": True,
        "measurement": measurement,
        "error": None,
    }