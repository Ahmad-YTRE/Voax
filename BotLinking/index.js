#!/usr/bin/env node
// bot-hosting.net starts this entry point. The single canonical bot runtime
// lives in src/ and is executed with tsx so hosted, Docker, and local runs
// share exactly the same Gateway, bridge, queue, retry, and shutdown code.
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: root,
  env: process.env,
  stdio: "inherit"
});

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (!child.killed) child.kill(signal);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", event: "bot_runtime_start_failed", message: error.message }));
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal && !stopping) console.error(JSON.stringify({ level: "error", event: "bot_runtime_signal_exit", signal }));
  process.exitCode = code ?? (signal ? 1 : 0);
});
