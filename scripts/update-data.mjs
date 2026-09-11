#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(__filename), "..");
const collectorCli = join(repoRoot, "collector", "bin", "market-data.mjs");
const userArgs = process.argv.slice(2);

const defaultArgs = [
  "stocks:update",
  "--all=true",
  "--mode=update",
  "--concurrency=2",
  "--delay-ms=500",
];

const commandArgs = [...defaultArgs, ...userArgs];

console.log(`Updating all local stock data...`);
console.log(`node collector/bin/market-data.mjs ${commandArgs.join(" ")}`);

const child = spawn(process.execPath, [collectorCli, ...commandArgs], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Update stopped by signal ${signal}.`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Cannot start data update: ${error.message}`);
  process.exit(1);
});
