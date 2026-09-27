from typing import Any

from app.collectors.wifi_collector import get_wifi_info


def analyze_performance() -> dict[str, Any]:
    """
    Collect current Wi-Fi connection performance metrics.

    This step uses the existing Windows Wi-Fi collector.
    No synthetic performance values are generated.
    """

    wifi = get_wifi_info()

    if not wifi.get("connected", False):
        return {
            "success": False,
            "error": wifi.get(
                "error",
                "Unable to collect Wi-Fi performance data.",
            ),
            "performance": None,
        }

    performance = {
        "connection_state": wifi.get("connection_state"),
        "ssid": wifi.get("ssid"),
        "signal_percent": wifi.get("signal_percent"),
        "rssi_dbm": wifi.get("rssi_dbm"),
        "receive_rate_mbps": wifi.get("receive_rate_mbps"),
        "transmit_rate_mbps": wifi.get("transmit_rate_mbps"),
        "channel": wifi.get("channel"),
        "band": wifi.get("band"),
        "radio_type": wifi.get("radio_type"),
    }

    return {
        "success": True,
        "performance": performance,
        "error": None,
    }