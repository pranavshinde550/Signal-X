import asyncio
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware

from app.collectors.wifi_collector import get_wifi_info
from app.collectors.network_scanner import scan_wifi_networks
from app.collectors.channel_analyzer import analyze_channels
from app.collectors.performance_analyzer import analyze_performance
from app.collectors.latency_analyzer import measure_latency
from app.collectors.coverage_analyzer import collect_coverage_point

from app.collectors.coverage_store import (
    add_measurement,
    get_measurements,
    get_measurement_count,
    clear_measurements,
)


# ---------------------------------------------------------
# FASTAPI APPLICATION
# ---------------------------------------------------------

app = FastAPI(
    title="Signal-X API",
    description="Real-Time Wi-Fi Signal Strength Analyzer",
    version="1.0.0",
)


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# ROOT
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "application": "Signal-X",
        "status": "online",
        "version": "1.0.0",
    }


# ---------------------------------------------------------
# HEALTH
# ---------------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "Signal-X backend",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------
# CURRENT WIFI
# ---------------------------------------------------------

@app.get("/api/wifi/current")
def current_wifi():
    return get_wifi_info()


# ---------------------------------------------------------
# NEARBY NETWORKS
# ---------------------------------------------------------

@app.get("/api/wifi/networks")
def nearby_networks():
    return scan_wifi_networks()


# ---------------------------------------------------------
# CHANNEL ANALYZER
# ---------------------------------------------------------

@app.get("/api/wifi/channels")
def wifi_channels():
    return analyze_channels()


# ---------------------------------------------------------
# PERFORMANCE ANALYZER
# ---------------------------------------------------------

@app.get("/api/wifi/performance")
def wifi_performance():
    return analyze_performance()


# ---------------------------------------------------------
# LATENCY ANALYZER
# ---------------------------------------------------------

@app.get("/api/wifi/latency")
def wifi_latency():
    return measure_latency()


# ---------------------------------------------------------
# COVERAGE - CURRENT POINT
# ---------------------------------------------------------

@app.get("/api/wifi/coverage/point")
def wifi_coverage_point():
    return collect_coverage_point()


# ---------------------------------------------------------
# COVERAGE - SAVE POINT
# ---------------------------------------------------------

@app.post("/api/wifi/coverage/point")
def save_wifi_coverage_point(measurement: dict = Body(...)):

    required_fields = [
        "latitude",
        "longitude",
        "accuracy_m",
        "rssi_dbm",
        "signal_percent",
    ]

    missing_fields = [
        field
        for field in required_fields
        if field not in measurement
    ]

    if missing_fields:
        return {
            "success": False,
            "measurement": None,
            "error": f"Missing fields: {', '.join(missing_fields)}",
        }

    try:
        measurement["latitude"] = float(
            measurement["latitude"]
        )

        measurement["longitude"] = float(
            measurement["longitude"]
        )

        measurement["accuracy_m"] = float(
            measurement["accuracy_m"]
        )

    except (TypeError, ValueError):
        return {
            "success": False,
            "measurement": None,
            "error": "Invalid location values.",
        }

    add_measurement(measurement)

    return {
        "success": True,
        "measurement": measurement,
        "error": None,
    }


# ---------------------------------------------------------
# COVERAGE - GET ALL MEASUREMENTS
# ---------------------------------------------------------

@app.get("/api/wifi/coverage")
def wifi_coverage():
    return {
        "success": True,
        "count": get_measurement_count(),
        "measurements": get_measurements(),
        "error": None,
    }


# ---------------------------------------------------------
# COVERAGE - CLEAR MEASUREMENTS
# ---------------------------------------------------------

@app.delete("/api/wifi/coverage")
def clear_wifi_coverage():

    clear_measurements()

    return {
        "success": True,
        "count": 0,
        "measurements": [],
        "error": None,
    }


# ---------------------------------------------------------
# WEBSOCKET MANAGER
# ---------------------------------------------------------

class ConnectionManager:

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_json(
        self,
        websocket: WebSocket,
        data: dict
    ):
        await websocket.send_json(data)


manager = ConnectionManager()


# ---------------------------------------------------------
# REAL-TIME WIFI WEBSOCKET
# ---------------------------------------------------------

@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):

    await manager.connect(websocket)

    try:

        while True:

            # Run the blocking Windows Wi-Fi command
            # outside the async event loop.
            wifi_data = await asyncio.to_thread(
                get_wifi_info
            )

            message = {
                "type": "wifi_metrics",

                "timestamp": datetime.now(
                    timezone.utc
                ).isoformat(),

                "data": wifi_data,
            }

            await manager.send_json(
                websocket,
                message,
            )

            # One measurement every second.
            await asyncio.sleep(1)

    except WebSocketDisconnect:

        manager.disconnect(websocket)

    except Exception:

        manager.disconnect(websocket)