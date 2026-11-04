#!/usr/bin/env node
"use strict";

// bot-hosting.net starts this CommonJS file. The single canonical bot runtime
// lives in src/ and is executed with tsx so local and hosted deployments use
// exactly the same Gateway, bridge, queue, retry, and shutdown implementation.
const { spawn } = require("node:child_process");

const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: __dirname,
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
