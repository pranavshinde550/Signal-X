from typing import Any


MAX_MEASUREMENTS = 500

_measurements: list[dict[str, Any]] = []


def add_measurement(measurement: dict[str, Any]) -> dict[str, Any]:
    """
    Store one coverage measurement in memory.

    The store is intentionally limited to MAX_MEASUREMENTS
    so memory usage cannot grow indefinitely.
    """

    _measurements.append(measurement)

    if len(_measurements) > MAX_MEASUREMENTS:
        del _measurements[:-MAX_MEASUREMENTS]

    return measurement


def get_measurements() -> list[dict[str, Any]]:
    """Return all stored coverage measurements."""

    return list(_measurements)


def clear_measurements() -> None:
    """Clear all stored coverage measurements."""

    _measurements.clear()


def get_measurement_count() -> int:
    """Return the number of stored measurements."""

    return len(_measurements)