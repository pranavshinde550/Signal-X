from collections import Counter
from typing import Any

from app.collectors.network_scanner import scan_wifi_networks


def analyze_channels() -> dict[str, Any]:
    """
    Analyze Wi-Fi channel usage using the existing network scanner.

    The scanner provides channel information for detected BSSIDs.
    This function groups those networks by channel and calculates
    basic congestion levels.
    """

    scan_result = scan_wifi_networks()

    if not scan_result.get("success"):
        return {
            "success": False,
            "error": scan_result.get(
                "error",
                "Unable to scan Wi-Fi networks.",
            ),
            "total_networks": 0,
            "bands": {
                "2.4 GHz": [],
                "5/6 GHz": [],
            },
        }

    networks = scan_result.get("networks", [])

    channel_counter: Counter[int] = Counter()

    band_channels: dict[str, Counter[int]] = {
        "2.4 GHz": Counter(),
        "5/6 GHz": Counter(),
    }

    for network in networks:
        channel = network.get("channel")
        band = network.get("band")

        if channel is None:
            continue

        channel_counter[channel] += 1

        if band == "2.4 GHz":
            band_channels["2.4 GHz"][channel] += 1
        else:
            band_channels["5/6 GHz"][channel] += 1

    all_channels = []

    for channel, count in sorted(channel_counter.items()):
        all_channels.append(
            {
                "channel": channel,
                "network_count": count,
                "congestion": get_congestion_level(count),
            }
        )

    return {
        "success": True,
        "total_networks": len(networks),
        "total_channels": len(all_channels),
        "channels": all_channels,
        "bands": {
            "2.4 GHz": build_band_data(
                band_channels["2.4 GHz"]
            ),
            "5/6 GHz": build_band_data(
                band_channels["5/6 GHz"]
            ),
        },
        "error": None,
    }


def build_band_data(
    channel_counter: Counter[int],
) -> list[dict[str, Any]]:
    """
    Convert channel counts into frontend-friendly data.
    """

    results = []

    for channel, count in sorted(channel_counter.items()):
        results.append(
            {
                "channel": channel,
                "network_count": count,
                "congestion": get_congestion_level(count),
            }
        )

    return results


def get_congestion_level(network_count: int) -> str:
    """
    Basic congestion classification based on the number
    of detected networks using a channel.

    0-1   -> Low
    2-3   -> Medium
    4+    -> High
    """

    if network_count <= 1:
        return "Low"

    if network_count <= 3:
        return "Medium"

    return "High"