#!/usr/bin/env node
// Shared guard for a running MarkLeaf instance (Windows).
// dev force-closes it and continues; package lists it and only force-closes
// after an explicit Y (or when MARKLEAF_FORCE_CLOSE=1 is set).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Product name plus every binary name Tauri may have produced. */
function readAppIdentity() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const product = typeof config.productName === 'string' ? config.productName : '';
  const configured = typeof config.mainBinaryName === 'string' ? config.mainBinaryName : '';
  const cargo = fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
  const packageSection = /\[package\]([\s\S]*?)(?:\n\[|$)/.exec(cargo)?.[1] ?? '';
  const bin = /^\s*name\s*=\s*"([^"]+)"/m.exec(packageSection)?.[1] ?? '';
  const names = [configured, bin, product]
    .filter(Boolean)
    .map((name) => `${name.replace(/\.exe$/i, '')}.exe`.toLowerCase());
  if (names.length === 0) throw new Error('Cannot determine the app executable name');
  return { label: product || bin, names: [...new Set(names)] };
}

const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;

function findAppProcesses(identity) {
  if (process.platform !== 'win32') return [];
  const script = [
    `$names = @(${identity.names.map(psQuote).join(',')})`,
    '$result = Get-CimInstance Win32_Process | Where-Object {',
    '  $_.Name -and ($names -contains $_.Name.ToLowerInvariant())',
    '} | ForEach-Object {',
    '  [pscustomobject]@{ ProcessId = $_.ProcessId; Name = $_.Name; ExecutablePath = $_.ExecutablePath }',
    '}',
    'if ($result) { $result | ConvertTo-Json -Compress }',
  ].join('\n');
  try {
    const output = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!output) return [];
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function forceClose(identity, processes) {
  for (const item of processes) {
    try {
      execFileSync('taskkill', ['/PID', String(item.ProcessId), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // The process may have exited already; the re-check below reports the result.
    }
  }
  sleep(800);
  const remaining = findAppProcesses(identity);
  if (remaining.length > 0) {
    const details = remaining.map((item) => `${item.Name}(${item.ProcessId})`).join(', ');
    throw new Error(`Could not close the running app (${details}); close it manually and retry.`);
  }
  console.log('[ ok ] Closed the running app instance(s); continuing.');
}

async function confirmForceClose(label) {
  if (process.env.MARKLEAF_FORCE_CLOSE === '1') return true;
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new Error(
      `${label} is still running. Close it first, or set MARKLEAF_FORCE_CLOSE=1 to confirm force-closing it.`,
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `Force-close ${label} and continue packaging? Enter Y to confirm; anything else cancels: `,
    );
    return /^\s*[Yy]([Ee][Ss])?\s*$/.test(answer);
  } finally {
    rl.close();
  }
}

/**
 * @param {{ mode?: 'force' | 'prompt' }} options
 * @returns {Promise<boolean>} false when the user cancelled the prompt.
 */
export async function guardRunningApp({ mode = 'prompt' } = {}) {
  const identity = readAppIdentity();
  const processes = findAppProcesses(identity);
  if (processes.length === 0) return true;

  console.warn(`[warn] ${identity.label} is running:`);
  for (const item of processes) {
    const location = item.ExecutablePath ? `  ${item.ExecutablePath}` : '  (path unavailable)';
    console.warn(`       PID ${String(item.ProcessId).padEnd(6)} ${item.Name}${location}`);
  }
  console.warn('[warn] Force-closing discards any unsaved state in the running app.');
  if (mode === 'force') {
    forceClose(identity, processes);
    return true;
  }

  if (!(await confirmForceClose(identity.label))) {
    console.warn('[info] Cancelled; the running app was left alone.');
    return false;
  }
  forceClose(identity, processes);
  return true;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const mode = process.argv.includes('--force') ? 'force' : 'prompt';
  try {
    const proceed = await guardRunningApp({ mode });
    if (!proceed) process.exit(2);
  } catch (error) {
    console.error(`[fail] ${error.message}`);
    process.exit(1);
  }
}
