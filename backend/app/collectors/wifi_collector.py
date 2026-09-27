import subprocess
import re
from typing import Any


def get_wifi_info() -> dict[str, Any]:
    """
    Collect current Wi-Fi information from Windows using netsh.

    Returns actual operating-system data.
    No simulated values are generated.
    """

    try:
        result = subprocess.run(
            [
                "netsh",
                "wlan",
                "show",
                "interfaces",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )

        if result.returncode != 0:
            return {
                "connected": False,
                "error": result.stderr.strip()
                or "Unable to query Wi-Fi information.",
            }

        output = result.stdout

        return parse_wifi_output(output)

    except subprocess.TimeoutExpired:
        return {
            "connected": False,
            "error": "Wi-Fi query timed out.",
        }

    except FileNotFoundError:
        return {
            "connected": False,
            "error": "Windows netsh command was not found.",
        }

    except Exception as exc:
        return {
            "connected": False,
            "error": str(exc),
        }


def parse_wifi_output(output: str) -> dict[str, Any]:
    """
    Parse Windows netsh WLAN interface output.
    """

    data: dict[str, Any] = {
        "connected": False,
        "interface_name": None,
        "description": None,
        "ssid": None,
        "bssid": None,
        "band": None,
        "channel": None,
        "radio_type": None,
        "authentication": None,
        "cipher": None,
        "connection_mode": None,
        "receive_rate_mbps": None,
        "transmit_rate_mbps": None,
        "signal_percent": None,
        "rssi_dbm": None,
        "profile": None,
    }

    lines = output.splitlines()

    for line in lines:
        line = line.strip()

        if not line or ":" not in line:
            continue

        key, value = line.split(":", 1)

        key = key.strip()
        value = value.strip()

        if key == "Name":
            data["interface_name"] = value

        elif key == "Description":
            data["description"] = value

        elif key == "State":
            data["connected"] = value.lower() == "connected"

        elif key == "SSID":
            data["ssid"] = value

        elif key == "AP BSSID":
            data["bssid"] = value

        elif key == "Band":
            data["band"] = value

        elif key == "Channel":
            try:
                data["channel"] = int(value)
            except ValueError:
                data["channel"] = None

        elif key == "Radio type":
            data["radio_type"] = value

        elif key == "Authentication":
            data["authentication"] = value

        elif key == "Cipher":
            data["cipher"] = value

        elif key == "Connection mode":
            data["connection_mode"] = value

        elif key == "Receive rate (Mbps)":
            try:
                data["receive_rate_mbps"] = float(value)
            except ValueError:
                pass

        elif key == "Transmit rate (Mbps)":
            try:
                data["transmit_rate_mbps"] = float(value)
            except ValueError:
                pass

        elif key == "Signal":
            match = re.search(r"(\d+)", value)

            if match:
                data["signal_percent"] = int(match.group(1))

        elif key == "Rssi":
            match = re.search(r"-?\d+", value)

            if match:
                data["rssi_dbm"] = int(match.group())

        elif key == "Profile":
            data["profile"] = value

    return data