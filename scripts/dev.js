const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const viteEntry = require.resolve("vite", {
    paths: [path.join(root, "client")]
});
const viteScript = path.resolve(path.dirname(viteEntry), "../../bin/vite.js");
const processes = [];
let stopping = false;
let clientStarted = false;
let serverOutput = "";

const stopProcesses = () => {
    stopping = true;
    for (const { child } of processes) {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill();
        }
    }
};

const startProcess = (label, args, cwd) => {
    const child = spawn(process.execPath, args, {
        cwd,
        env: process.env,
        stdio: ["inherit", "pipe", "pipe"]
    });
    processes.push({ label, child });
    child.stdout.on("data", (chunk) => {
        process.stdout.write(`[${label}] ${chunk}`);
        if (label === "server") {
            serverOutput += chunk.toString();
            if (serverOutput.includes("VIBE server running on port")) {
                startClient();
            }
            serverOutput = serverOutput.slice(-100);
        }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
    child.on("error", (error) => {
        console.error(`Could not start the VIBE ${label}:`, error.message);
        process.exitCode = 1;
        stopProcesses();
    });
    child.on("exit", (code, signal) => {
        if (!stopping) {
            console.error(`The VIBE ${label} stopped (${signal || `exit ${code}`}).`);
            process.exitCode = code || 1;
            stopProcesses();
        }
        if (processes.every(({ child: processChild }) => (
            processChild.exitCode !== null || processChild.signalCode !== null
        ))) {
            process.exit(process.exitCode || 0);
        }
    });
    return child;
};

const startClient = () => {
    if (clientStarted || stopping) return;
    clientStarted = true;
    startProcess("client", [viteScript], path.join(root, "client"));
};

startProcess("server", [
    "--watch",
    path.join(root, "server", "server.js")
], path.join(root, "server"));

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        stopProcesses();
    });
}
