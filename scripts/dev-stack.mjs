#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const runtimeDir = path.resolve(root, ".runtime");
const logsDir = path.resolve(runtimeDir, "logs");
const pidFile = path.resolve(runtimeDir, "dev-stack.json");

const services = [
  { name: "api", cmd: "npm", args: ["run", "dev", "-w", "@cspm/api"], port: 4000 },
  { name: "worker", cmd: "npm", args: ["run", "dev", "-w", "@cspm/worker"], port: 4010 },
  { name: "web", cmd: "npm", args: ["run", "dev", "-w", "@cspm/web"], port: 3000 }
];

const mode = process.argv[2] ?? "status";

function ensureRuntimeDirs() {
  fs.mkdirSync(logsDir, { recursive: true });
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function loadState() {
  if (!fs.existsSync(pidFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(pidFile, "utf8"));
  } catch {
    return null;
  }
}

function saveState(state) {
  ensureRuntimeDirs();
  fs.writeFileSync(pidFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function killPid(pid) {
  if (!isRunning(pid)) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }
  }
}

function status() {
  const state = loadState();
  if (!state?.services?.length) {
    console.log("dev stack: stopped");
    process.exit(0);
  }

  const rows = state.services.map((svc) => ({
    name: svc.name,
    pid: svc.pid,
    running: isRunning(svc.pid),
    log: svc.log
  }));

  const anyRunning = rows.some((row) => row.running);
  console.log(anyRunning ? "dev stack: running" : "dev stack: stale");
  for (const row of rows) {
    console.log(`- ${row.name}: ${row.running ? "up" : "down"} (pid ${row.pid}) log=${row.log}`);
  }
  process.exit(anyRunning ? 0 : 1);
}

async function up() {
  if (process.env.SKIP_SCANNER_PREFLIGHT !== "1") {
    const preflight = spawnSync("bash", ["scripts/preflight-scanners.sh"], {
      cwd: root,
      stdio: "inherit",
      env: process.env
    });
    if (preflight.status !== 0) {
      console.error("scanner preflight failed. run `npm run scanners:prewarm` then retry.");
      process.exit(preflight.status ?? 1);
    }
  }

  const state = loadState();
  const alive = state?.services?.filter((svc) => isRunning(svc.pid)) ?? [];
  if (alive.length > 0) {
    console.error("dev stack already running. run `npm run dev:status` or `npm run dev:down` first.");
    process.exit(1);
  }

  ensureRuntimeDirs();
  const busyPorts = [];
  for (const service of services) {
    const free = await isPortFree(service.port);
    if (!free) busyPorts.push({ name: service.name, port: service.port });
  }
  if (busyPorts.length > 0) {
    for (const port of busyPorts) {
      console.error(`port ${port.port} is in use (${port.name} cannot start)`);
    }
    process.exit(1);
  }

  const started = [];
  for (const service of services) {
    const logPath = path.resolve(logsDir, `${service.name}.log`);
    const fd = fs.openSync(logPath, "a");
    const child = spawn(service.cmd, service.args, {
      cwd: root,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: process.env
    });
    child.unref();
    fs.closeSync(fd);
    started.push({ name: service.name, pid: child.pid, log: path.relative(root, logPath) });
  }

  saveState({ startedAt: new Date().toISOString(), services: started });
  console.log("dev stack started");
  for (const svc of started) {
    console.log(`- ${svc.name}: pid ${svc.pid}, log=${svc.log}`);
  }
  console.log("next: npm run health");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

function down() {
  const state = loadState();
  if (!state?.services?.length) {
    console.log("dev stack already stopped");
    return;
  }

  for (const svc of state.services) {
    killPid(svc.pid);
  }

  fs.rmSync(pidFile, { force: true });
  console.log("dev stack stopped");
}

function logs() {
  ensureRuntimeDirs();
  const state = loadState();
  const logPaths = state?.services?.length
    ? state.services.map((svc) => path.resolve(root, svc.log))
    : services.map((svc) => path.resolve(logsDir, `${svc.name}.log`));
  const existingLogs = logPaths.filter((logPath) => fs.existsSync(logPath));

  if (existingLogs.length === 0) {
    console.error("no dev-stack logs found. run `npm run dev:up` first.");
    process.exit(1);
  }

  console.log(`tailing logs:\n- ${existingLogs.join("\n- ")}`);
  const tail = spawn("tail", ["-n", "120", "-f", ...existingLogs], { stdio: "inherit" });
  tail.on("exit", (code) => process.exit(code ?? 0));
}

function parseListeningPidsFromLsofOutput(output) {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) return [];
  const pids = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(/\s+/);
    const pid = Number(cols[1]);
    if (Number.isFinite(pid) && pid > 0) pids.push(pid);
  }
  return Array.from(new Set(pids));
}

async function doctor() {
  const state = loadState();
  const tracked = state?.services?.map((svc) => svc.name) ?? [];
  console.log(`tracked services: ${tracked.length > 0 ? tracked.join(", ") : "none"}`);
  if (state?.services?.length) {
    const stale = state.services.filter((svc) => !isRunning(svc.pid));
    if (stale.length > 0) {
      console.log(`tracked stale entries: ${stale.map((svc) => `${svc.name}:${svc.pid}`).join(", ")}`);
      console.log("suggestion: run `npm run dev:down` to clear stale state.");
    }
  }

  let allFree = true;
  const recoveryCommands = [];
  for (const service of services) {
    const free = await isPortFree(service.port);
    if (free) {
      console.log(`- ${service.name} port ${service.port}: free`);
      continue;
    }

    allFree = false;
    console.log(`- ${service.name} port ${service.port}: in use`);
    const lsof = spawnSync("lsof", ["-nP", `-iTCP:${service.port}`, "-sTCP:LISTEN"], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
      env: process.env
    });
    const details = lsof.stdout?.trim();
    if (details) console.log(details);
    const pids = parseListeningPidsFromLsofOutput(details ?? "");
    if (pids.length > 0) {
      recoveryCommands.push(`# ${service.name}(${service.port})`);
      recoveryCommands.push(`kill ${pids.join(" ")}`);
    }
  }

  if (allFree) {
    console.log("doctor: all service ports are free.");
    return;
  }

  console.log("doctor: one or more ports are occupied. stop those processes, then run `npm run dev:up`.");
  if (recoveryCommands.length > 0) {
    console.log("safe recovery commands:");
    for (const cmd of recoveryCommands) console.log(cmd);
  }
}

if (mode === "up") await up();
else if (mode === "down") down();
else if (mode === "logs") logs();
else if (mode === "doctor") await doctor();
else status();
