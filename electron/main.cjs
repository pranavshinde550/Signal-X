const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let backendProcess = null;


// ---------------------------------------------------------
// PATHS
// ---------------------------------------------------------

function getBackendExecutable() {
    if (app.isPackaged) {
        return path.join(
            process.resourcesPath,
            "backend",
            "SignalXBackend",
            "SignalXBackend.exe"
        );
    }

    return path.join(
        __dirname,
        "..",
        "backend",
        "dist",
        "SignalXBackend",
        "SignalXBackend.exe"
    );
}


function getFrontendPath() {
    if (app.isPackaged) {
        return path.join(
            process.resourcesPath,
            "frontend",
            "dist",
            "index.html"
        );
    }

    return path.join(
        __dirname,
        "..",
        "frontend",
        "dist",
        "index.html"
    );
}


// ---------------------------------------------------------
// BACKEND
// ---------------------------------------------------------

function startBackend() {
    const backendExecutable = getBackendExecutable();

    console.log(
        `[Signal-X] Starting backend: ${backendExecutable}`
    );

    backendProcess = spawn(
        backendExecutable,
        [],
        {
            cwd: path.dirname(backendExecutable),
            windowsHide: false,
        }
    );

    backendProcess.stdout.on("data", (data) => {
        console.log(
            `[Signal-X Backend] ${data}`
        );
    });

    backendProcess.stderr.on("data", (data) => {
        console.error(
            `[Signal-X Backend] ${data}`
        );
    });

    backendProcess.on("error", (error) => {
        console.error(
            "[Signal-X Backend] Failed to start:",
            error
        );
    });

    backendProcess.on("close", (code) => {
        console.log(
            `[Signal-X Backend] Process exited with code ${code}`
        );

        backendProcess = null;
    });
}


// ---------------------------------------------------------
// STOP BACKEND
// ---------------------------------------------------------

function stopBackend() {
    if (backendProcess) {
        console.log(
            "[Signal-X] Stopping backend..."
        );

        backendProcess.kill();
        backendProcess = null;
    }
}


// ---------------------------------------------------------
// ELECTRON WINDOW
// ---------------------------------------------------------

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,

        minWidth: 1100,
        minHeight: 700,

        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const frontendPath = getFrontendPath();

    win.loadFile(frontendPath);
}


// ---------------------------------------------------------
// APPLICATION START
// ---------------------------------------------------------

app.whenReady().then(() => {

    startBackend();

    createWindow();

    app.on("activate", () => {

        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }

    });
});


// ---------------------------------------------------------
// APPLICATION EXIT
// ---------------------------------------------------------

app.on("before-quit", () => {
    stopBackend();
});


app.on("window-all-closed", () => {

    if (process.platform !== "darwin") {
        app.quit();
    }

});