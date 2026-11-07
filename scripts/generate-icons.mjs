import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iconsDir = join(root, 'src-tauri', 'icons');
mkdirSync(iconsDir, { recursive: true });

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter type 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const b = c1 / c2;
  return Math.hypot(px - (ax + b * vx), py - (ay + b * vy));
}

function blendPixel(buf, idx, r, g, b, alpha) {
  if (alpha <= 0) return;
  const a = Math.max(0, Math.min(1, alpha));
  const dstR = buf[idx];
  const dstG = buf[idx + 1];
  const dstB = buf[idx + 2];
  const dstA = buf[idx + 3] / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  buf[idx] = Math.round((r * a + dstR * dstA * (1 - a)) / outA);
  buf[idx + 1] = Math.round((g * a + dstG * dstA * (1 - a)) / outA);
  buf[idx + 2] = Math.round((b * a + dstB * dstA * (1 - a)) / outA);
  buf[idx + 3] = Math.round(outA * 255);
}

/**
 * Render MarkLeaf Icon:
 * - Rounded squircle badge in deep forest emerald gradient (#112821 -> #1d4d3c)
 * - Subtle warm parchment document page silhouette on left/bottom
 * - Crisp glowing botanical leaf + central vein + Markdown lines on top
 */
function renderMarkLeafIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const aa = 1.5 / size;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      const idx = (py * size + px) * 4;

      // 1. Rounded rectangle badge (margin 0.06, radius 0.22)
      const cx = Math.abs(u - 0.5);
      const cy = Math.abs(v - 0.5);
      const half = 0.44;
      const rad = 0.21;
      const qx = Math.max(cx - (half - rad), 0);
      const qy = Math.max(cy - (half - rad), 0);
      const badgeDist = Math.hypot(qx, qy) - rad;
      const badgeAlpha = 1 - smoothstep(-aa, aa, badgeDist);
      if (badgeAlpha <= 0) continue;

      // Deep emerald gradient background
      const grad = u * 0.45 + v * 0.55;
      const bgR = Math.round(16 + grad * 14);
      const bgG = Math.round(42 + grad * 38);
      const bgB = Math.round(33 + grad * 26);
      blendPixel(rgba, idx, bgR, bgG, bgB, badgeAlpha);

      // Subtle inner border highlight
      const borderAlpha =
        (1 - smoothstep(-aa * 2.2, 0, badgeDist)) *
        smoothstep(-aa * 4.5, -aa * 1.5, badgeDist) *
        0.35;
      blendPixel(rgba, idx, 110, 231, 183, borderAlpha);

      // 2. Warm paper card silhouette (shifted slightly left-up)
      const cardCx = Math.abs(u - 0.44);
      const cardCy = Math.abs(v - 0.52);
      const cardQx = Math.max(cardCx - (0.21 - 0.06), 0);
      const cardQy = Math.max(cardCy - (0.25 - 0.06), 0);
      const cardDist = Math.hypot(cardQx, cardQy) - 0.06;
      const cardAlpha = (1 - smoothstep(-aa, aa, cardDist)) * 0.16;
      blendPixel(rgba, idx, 250, 246, 235, cardAlpha);

      // 3. Botanical Leaf shape (tilted 42 degrees from bottom-left to top-right)
      const lx = u - 0.53;
      const ly = v - 0.47;
      const angle = -Math.PI * 0.24;
      const rx = lx * Math.cos(angle) - ly * Math.sin(angle);
      const ry = lx * Math.sin(angle) + ly * Math.cos(angle);

      // Leaf parametric envelope: rx in [-0.28, 0.28]
      const normX = rx / 0.27;
      if (Math.abs(normX) <= 1.08) {
        const clampedX = Math.max(-1, Math.min(1, normX));
        // Pointed tip on right (+1), rounded base on left (-1)
        const halfWidth = 0.145 * Math.pow(1 - clampedX * clampedX, 0.68) * (1 - 0.18 * clampedX);
        const leafDist = Math.abs(ry) - halfWidth;
        const leafAlpha = (1 - smoothstep(-aa * 1.2, aa * 1.2, leafDist)) * badgeAlpha;

        if (leafAlpha > 0) {
          // Two-tone leaf: upper half vibrant mint (#34d399 -> #6ee7b7), lower half rich jade (#10b981 -> #059669)
          const isUpper = ry < 0;
          const tLeaf = (clampedX + 1) * 0.5;
          const lr = isUpper ? Math.round(52 + tLeaf * 58) : Math.round(16 + tLeaf * 28);
          const lg = isUpper ? Math.round(211 + tLeaf * 24) : Math.round(175 + tLeaf * 25);
          const lb = isUpper ? Math.round(153 + tLeaf * 32) : Math.round(122 + tLeaf * 20);
          blendPixel(rgba, idx, lr, lg, lb, leafAlpha);
        }
      }

      // 4. Leaf stem & central midrib vein (from bottom-left to leaf tip)
      const veinDist = distToSegment(u, v, 0.28, 0.72, 0.72, 0.28);
      const veinAlpha = (1 - smoothstep(0.013, 0.013 + aa * 1.4, veinDist)) * badgeAlpha;
      blendPixel(rgba, idx, 246, 253, 249, veinAlpha * 0.95);

      // Side veins (3 pairs of delicate lateral veins)
      const veins = [
        [0.44, 0.56, 0.42, 0.43],
        [0.44, 0.56, 0.57, 0.58],
        [0.54, 0.46, 0.52, 0.34],
        [0.54, 0.46, 0.66, 0.48],
      ];
      for (const [ax, ay, bx, by] of veins) {
        const d = distToSegment(u, v, ax, ay, bx, by);
        const a = (1 - smoothstep(0.009, 0.009 + aa * 1.3, d)) * badgeAlpha;
        blendPixel(rgba, idx, 240, 253, 246, a * 0.85);
      }

      // 5. Crisp Markdown 'M' emblem badge in top-left corner
      const mLines = [
        [0.24, 0.37, 0.24, 0.23],
        [0.24, 0.23, 0.31, 0.31],
        [0.31, 0.31, 0.38, 0.23],
        [0.38, 0.23, 0.38, 0.37],
      ];
      for (const [ax, ay, bx, by] of mLines) {
        const d = distToSegment(u, v, ax, ay, bx, by);
        const a = (1 - smoothstep(0.014, 0.014 + aa * 1.3, d)) * badgeAlpha;
        blendPixel(rgba, idx, 254, 243, 199, a * 0.92);
      }
    }
  }
  return encodePng(size, size, rgba);
}

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const { size, png } = pngBuffers[i];
    const entryOffset = 6 + i * 16;
    header[entryOffset] = size >= 256 ? 0 : size;
    header[entryOffset + 1] = size >= 256 ? 0 : size;
    header[entryOffset + 2] = 0;
    header[entryOffset + 3] = 0;
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  }
  return Buffer.concat([header, ...pngBuffers.map((p) => p.png)]);
}

function buildIcns(png256) {
  // 'ic08' = 256x256 PNG payload inside ICNS container
  const chunkLen = 8 + png256.length;
  const totalLen = 8 + chunkLen;
  const buf = Buffer.alloc(16);
  buf.write('icns', 0, 4, 'ascii');
  buf.writeUInt32BE(totalLen, 4);
  buf.write('ic08', 8, 4, 'ascii');
  buf.writeUInt32BE(chunkLen, 12);
  return Buffer.concat([buf, png256]);
}

const png32 = renderMarkLeafIcon(32);
const png128 = renderMarkLeafIcon(128);
const png256 = renderMarkLeafIcon(256);

writeFileSync(join(iconsDir, '32x32.png'), png32);
writeFileSync(join(iconsDir, '128x128.png'), png128);
writeFileSync(join(iconsDir, '128x128@2x.png'), png256);
writeFileSync(join(iconsDir, 'icon.png'), png256);
writeFileSync(
  join(iconsDir, 'icon.ico'),
  buildIco([
    { size: 32, png: png32 },
    { size: 128, png: png128 },
    { size: 256, png: png256 },
  ]),
);
writeFileSync(join(iconsDir, 'icon.icns'), buildIcns(png256));

console.log('Generated MarkLeaf icons in src-tauri/icons/');
