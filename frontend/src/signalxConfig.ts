const API_BASE =
  import.meta.env.VITE_SIGNALX_API_URL ||
  "http://127.0.0.1:8000";

export const SIGNALX_API_BASE = API_BASE;

export const SIGNALX_WS_URL =
  API_BASE.replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:") + "/ws/live";