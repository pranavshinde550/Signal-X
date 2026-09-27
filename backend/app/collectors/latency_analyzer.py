import re
import subprocess
from typing import Any


def get_default_gateway() -> str | None:
    """Get the default IPv4 gateway from Windows."""

    try:
        result = subprocess.run(
            ["ipconfig"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )

        lines = result.stdout.splitlines()

        for index, line in enumerate(lines):
            if "Default Gateway" not in line:
                continue

            # Check the current line first.
            match = re.search(
                r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
                line,
            )

            if match:
                return match.group(0)

            # Windows may place the IPv4 gateway on the next line
            # when an IPv6 gateway is also present.
            for next_line in lines[index + 1:index + 3]:
                match = re.search(
                    r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
                    next_line,
                )

                if match:
                    return match.group(0)

    except Exception:
        pass

    return None



def measure_latency() -> dict[str, Any]:
    """Measure ICMP latency to the local default gateway."""

    gateway = get_default_gateway()

    if not gateway:
        return {
            "success": False,
            "gateway": None,
            "latency_ms": None,
            "status": "Unavailable",
            "error": "Default gateway could not be detected.",
        }

    try:
        result = subprocess.run(
            ["ping", "-n", "1", "-w", "1000", gateway],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=3,
        )

        if result.returncode != 0:
            return {
                "success": False,
                "gateway": gateway,
                "latency_ms": None,
                "status": "Timeout",
                "error": "Gateway did not respond to ping.",
            }

        match = re.search(
            r"(?:time[=<])\s*(\d+)\s*ms",
            result.stdout,
            re.IGNORECASE,
        )

        if not match:
            return {
                "success": False,
                "gateway": gateway,
                "latency_ms": None,
                "status": "Unknown",
                "error": "Latency value could not be parsed.",
            }

        latency = int(match.group(1))

        if latency < 20:
            status = "Excellent"
        elif latency < 50:
            status = "Good"
        elif latency < 100:
            status = "Fair"
        else:
            status = "High"

        return {
            "success": True,
            "gateway": gateway,
            "latency_ms": latency,
            "status": status,
            "error": None,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "gateway": gateway,
            "latency_ms": None,
            "status": "Timeout",
            "error": "Latency measurement timed out.",
        }

    except Exception as exc:
        return {
            "success": False,
            "gateway": gateway,
            "latency_ms": None,
            "status": "Error",
            "error": str(exc),
        }