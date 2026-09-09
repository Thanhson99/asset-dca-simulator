#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const commandPath = join(dirname(__filename), 'market-data.mjs');

const result = spawnSync(
  process.execPath,
  [commandPath, 'stocks:update', '--mode=update', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
