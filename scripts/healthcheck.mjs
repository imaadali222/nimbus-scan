#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.resolve(root, ".env");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parsePort(rawValue, fallback) {
  const value = Number(rawValue);
  if (Number.isInteger(value) && value > 0 && value <= 65535) return value;
  return fallback;
}

async function checkEndpoint(name, url) {
  try {
    const res = await fetch(url);
    const ok = res.ok;
    const body = await res.text();
    return { name, ok, status: res.status, body };
  } catch (error) {
    return { name, ok: false, status: 0, body: error instanceof Error ? error.message : "request failed" };
  }
}

async function main() {
  const env = parseEnvFile(envPath);
  const databaseUrl = process.env.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const host = process.env.HEALTHCHECK_HOST ?? env.HEALTHCHECK_HOST ?? "localhost";
  const webPort = parsePort(process.env.WEB_PORT ?? env.WEB_PORT, 3000);
  const apiPort = parsePort(process.env.API_PORT ?? env.API_PORT, 4000);
  const workerPort = parsePort(process.env.WORKER_PORT ?? env.WORKER_PORT, 4010);

  let dbOk = false;
  let dbDetail = "missing DATABASE_URL";
  if (databaseUrl.startsWith("file:")) {
    const candidate = databaseUrl.slice(5);
    const dbPath = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
    dbOk = fs.existsSync(dbPath);
    dbDetail = dbOk ? dbPath : `not found: ${dbPath}`;
  } else if (databaseUrl) {
    dbOk = true;
    dbDetail = "non-file DATABASE_URL configured";
  }

  const checks = await Promise.all([
    checkEndpoint("web", `http://${host}:${webPort}/api/health`),
    checkEndpoint("api", `http://${host}:${apiPort}/health`),
    checkEndpoint("api-ready", `http://${host}:${apiPort}/ready`),
    checkEndpoint("worker", `http://${host}:${workerPort}/health`),
    checkEndpoint("worker-ready", `http://${host}:${workerPort}/ready`)
  ]);

  const summary = {
    timestamp: new Date().toISOString(),
    database: { ok: dbOk, detail: dbDetail },
    checks: checks.map((check) => ({
      name: check.name,
      ok: check.ok,
      status: check.status,
      detail: check.body.slice(0, 240)
    }))
  };

  console.log(JSON.stringify(summary, null, 2));
  const allOk = dbOk && checks.every((check) => check.ok);
  process.exit(allOk ? 0 : 1);
}

main();
