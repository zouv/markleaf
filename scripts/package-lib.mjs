// Shared packaging helpers for Node-based desktop types (Tauri / Electron).
// No third-party dependencies: zip writing, manifest, hashing and transactional publish use Node built-ins.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function listFiles(dir, root = dir, seen = new Set()) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const rootReal = normalize(fs.realpathSync(root));
  const dirReal = normalize(fs.realpathSync(dir));
  if (dirReal !== rootReal && !dirReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new Error(`Refusing to package a path outside the source root: ${dir}`);
  }
  if (seen.has(dirReal)) return [];
  seen.add(dirReal);
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    let real;
    try { real = normalize(fs.realpathSync(full)); }
    catch { continue; }
    if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) {
      throw new Error(`Refusing to package a symbolic link outside the source root: ${full}`);
    }
    const stat = fs.statSync(full);
    if (stat.isDirectory()) result.push(...listFiles(full, root, seen));
    else if (stat.isFile()) result.push(full);
  }
  return result;
}

export function copyDir(source, destination) {
  fs.cpSync(source, destination, { recursive: true, force: true });
}

export function copyFile(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function platformTag() {
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  if (process.platform === 'win32') return `win-${arch}`;
  if (process.platform === 'darwin') return `macos-${arch}`;
  if (process.platform === 'linux') return `linux-${arch}`;
  throw new Error(`Unsupported packaging platform: ${process.platform}`);
}

export function writeText(file, lines) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

export function writeManifest(directory, manifestPath, meta) {
  const manifestFull = path.resolve(manifestPath);
  const files = listFiles(directory)
    .filter((file) => path.resolve(file) !== manifestFull)
    .sort((a, b) => a.localeCompare(b));
  const entries = files.map((file) => ({
    path: path.relative(directory, file).split(path.sep).join('/'),
    size: fs.statSync(file).size,
    sha256: sha256File(file),
  }));
  const manifest = { format: 1, ...meta, createdAt: new Date().toISOString(), files: entries };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function writeChecksums(file, artifacts) {
  const lines = artifacts.map((artifact) => `${sha256File(artifact.path)} *${artifact.name}`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'ascii');
}

export function writeZip(sourceDir, zipPath, prefix = '') {
  const files = listFiles(sourceDir);
  if (files.length > 65535) throw new Error('ZIP entry limit exceeded (65535 files)');
  ensureDir(path.dirname(zipPath));
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  const fd = fs.openSync(zipPath, 'w');
  const entries = [];
  let offset = 0;
  try {
    for (const file of files) {
      const relative = path.relative(sourceDir, file).split(path.sep).join('/');
      const name = prefix ? `${prefix}/${relative}` : relative;
      const data = fs.readFileSync(file);
      if (data.length > 0xffffffff) throw new Error(`File too large for ZIP: ${file}`);
      const compressed = zlib.deflateRawSync(data, { level: 9 });
      const stat = fs.statSync(file);
      const { time, day } = dosDateTime(stat.mtime);
      const nameBuffer = Buffer.from(name, 'utf8');
      const crc = crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(8, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(day, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuffer.length, 26);
      local.writeUInt16LE(0, 28);
      fs.writeSync(fd, local);
      fs.writeSync(fd, nameBuffer);
      fs.writeSync(fd, compressed);
      entries.push({ nameBuffer, crc, compressedSize: compressed.length, size: data.length, time, day, offset });
      offset += local.length + nameBuffer.length + compressed.length;
    }
    const centralStart = offset;
    for (const entry of entries) {
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8);
      central.writeUInt16LE(8, 10);
      central.writeUInt16LE(entry.time, 12);
      central.writeUInt16LE(entry.day, 14);
      central.writeUInt32LE(entry.crc, 16);
      central.writeUInt32LE(entry.compressedSize, 20);
      central.writeUInt32LE(entry.size, 24);
      central.writeUInt16LE(entry.nameBuffer.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(entry.offset, 42);
      fs.writeSync(fd, central);
      fs.writeSync(fd, entry.nameBuffer);
      offset += central.length + entry.nameBuffer.length;
    }
    const centralSize = offset - centralStart;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralStart, 16);
    eocd.writeUInt16LE(0, 20);
    fs.writeSync(fd, eocd);
  } finally {
    fs.closeSync(fd);
  }
  verifyZip(zipPath, entries.length);
}

function verifyZip(zipPath, expectedEntries) {
  const size = fs.statSync(zipPath).size;
  if (size < 22) throw new Error(`Invalid ZIP: ${zipPath}`);
  const fd = fs.openSync(zipPath, 'r');
  try {
    const eocd = Buffer.alloc(22);
    fs.readSync(fd, eocd, 0, 22, size - 22);
    if (eocd.readUInt32LE(0) !== 0x06054b50) throw new Error(`Invalid ZIP end record: ${zipPath}`);
    const count = eocd.readUInt16LE(10);
    if (count !== expectedEntries) throw new Error(`ZIP entry count mismatch: ${zipPath}`);
  } finally {
    fs.closeSync(fd);
  }
}

export function publishPackageSet(root, stage, dist) {
  const backup = path.join(stage, 'previous');
  ensureDir(backup);
  const saved = [];
  const promoted = [];
  const isInside = (target) => {
    const relative = path.relative(root, target);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  };
  for (const name of ['dev', 'release']) {
    if (!isInside(path.join(stage, name)) || !isInside(path.join(dist, name))) {
      throw new Error('Package target escapes workspace');
    }
  }
  try {
    for (const name of ['dev', 'release']) {
      const source = path.join(stage, name);
      const target = path.join(dist, name);
      const old = path.join(backup, name);
      if (fs.existsSync(target)) {
        fs.renameSync(target, old);
        saved.push(name);
      }
      fs.renameSync(source, target);
      promoted.push(name);
    }
  } catch (error) {
    const rollback = [];
    for (const name of ['release', 'dev']) {
      const source = path.join(stage, name);
      const target = path.join(dist, name);
      const old = path.join(backup, name);
      try {
        if (promoted.includes(name) && fs.existsSync(target)) fs.renameSync(target, source);
        if (saved.includes(name) && fs.existsSync(old)) fs.renameSync(old, target);
      } catch (rollbackError) {
        rollback.push(rollbackError.message);
      }
    }
    if (rollback.length > 0) {
      throw new Error(`Publish failed: ${error.message}; rollback incomplete at ${stage}: ${rollback.join('; ')}`);
    }
    throw error;
  }
}

export function acquireLock(lockPath) {
  ensureDir(path.dirname(lockPath));
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.closeSync(fd);
  } catch {
    throw new Error(`Another packaging run holds ${lockPath}. Wait for it to finish, or remove a stale lock.`);
  }
}

export function releaseLock(lockPath) {
  try { fs.rmSync(lockPath, { force: true }); } catch { /* ignore */ }
}
