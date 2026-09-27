import re
import subprocess
from typing import Any


def scan_wifi_networks() -> dict[str, Any]:
    """
    Scan nearby Wi-Fi networks using Windows netsh.

    This returns real networks detected by the
    computer's Wi-Fi adapter.
    """

    try:
        result = subprocess.run(
            [
                "netsh",
                "wlan",
                "show",
                "networks",
                "mode=bssid",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )

        if result.returncode != 0:
            return {
                "success": False,
                "networks": [],
                "count": 0,
                "error": (
                    result.stderr.strip()
                    or "Wi-Fi scan failed."
                ),
            }

        networks = parse_network_scan(
            result.stdout
        )

        return {
            "success": True,
            "networks": networks,
            "count": len(networks),
            "error": None,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "networks": [],
            "count": 0,
            "error": "Wi-Fi scan timed out.",
        }

    except FileNotFoundError:
        return {
            "success": False,
            "networks": [],
            "count": 0,
            "error": "Windows netsh command was not found.",
        }

    except Exception as exc:
        return {
            "success": False,
            "networks": [],
            "count": 0,
            "error": str(exc),
        }


def parse_network_scan(
    output: str,
) -> list[dict[str, Any]]:

    networks: list[dict[str, Any]] = []

    current_ssid = None
    current_authentication = None
    current_cipher = None

    current_bssid = None
    current_signal = None
    current_radio = None
    current_channel = None

    def save_bssid():

        nonlocal current_bssid
        nonlocal current_signal
        nonlocal current_radio
        nonlocal current_channel

        if current_ssid is None:
            return

        if current_bssid is None:
            return

        networks.append(
            {
                "ssid": current_ssid,
                "bssid": current_bssid,
                "signal_percent": current_signal,
                "rssi_dbm": signal_to_rssi(
                    current_signal
                ),
                "radio_type": current_radio,
                "channel": current_channel,
                "band": channel_to_band(
                    current_channel
                ),
                "authentication":
                    current_authentication,
                "cipher": current_cipher,
            }
        )

        current_bssid = None
        current_signal = None
        current_radio = None
        current_channel = None

    lines = output.splitlines()

    for raw_line in lines:

        line = raw_line.strip()

        if not line:
            continue

        # -----------------------------------------
        # SSID
        # -----------------------------------------

        match = re.match(
            r"^SSID\s+\d+\s*:\s*(.*)$",
            line,
            re.IGNORECASE,
        )

        if match:

            save_bssid()

            current_ssid = (
                match.group(1).strip()
            )

            current_authentication = None
            current_cipher = None

            continue

        # -----------------------------------------
        # Authentication
        # -----------------------------------------

        if line.lower().startswith(
            "authentication"
        ):

            if ":" in line:
                current_authentication = (
                    line.split(
                        ":",
                        1
                    )[1].strip()
                )

            continue

        # -----------------------------------------
        # Encryption
        # -----------------------------------------

        if line.lower().startswith(
            "encryption"
        ):

            if ":" in line:
                current_cipher = (
                    line.split(
                        ":",
                        1
                    )[1].strip()
                )

            continue

        # -----------------------------------------
        # BSSID
        # -----------------------------------------

        match = re.match(
            r"^BSSID\s+\d+\s*:\s*(.+)$",
            line,
            re.IGNORECASE,
        )

        if match:

            save_bssid()

            current_bssid = (
                match.group(1).strip()
            )

            continue

        # -----------------------------------------
        # Signal
        # -----------------------------------------

        if line.lower().startswith(
            "signal"
        ):

            match = re.search(
                r"(\d+)\s*%",
                line,
            )

            if match:
                current_signal = int(
                    match.group(1)
                )

            continue

        # -----------------------------------------
        # Radio
        # -----------------------------------------

        if line.lower().startswith(
            "radio type"
        ):

            if ":" in line:
                current_radio = (
                    line.split(
                        ":",
                        1
                    )[1].strip()
                )

            continue

        # -----------------------------------------
        # Channel
        # -----------------------------------------

        if line.lower().startswith(
            "channel"
        ):

            match = re.search(
                r"(\d+)",
                line,
            )

            if match:
                current_channel = int(
                    match.group(1)
                )

            continue

    # Save final network
    save_bssid()

    return networks


def signal_to_rssi(
    signal_percent: int | None,
) -> float | None:
    """
    Estimate RSSI from Windows signal percentage.

    Windows netsh scan output normally gives
    signal percentage for nearby networks.

    Therefore this value is an ESTIMATE,
    not measured raw RSSI.
    """

    if signal_percent is None:
        return None

    # Approximate conversion.
    rssi = (
        (signal_percent / 2) - 100
    )

    return round(rssi, 1)


def channel_to_band(
    channel: int | None,
) -> str | None:
    """
    Conservative band classification.

    1-14 = 2.4 GHz.

    Higher channels can belong to 5 GHz
    or 6 GHz depending on the WLAN
    configuration, so we don't falsely
    distinguish them yet.
    """

    if channel is None:
        return None

    if 1 <= channel <= 14:
        return "2.4 GHz"

    return "5/6 GHz"