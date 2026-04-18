#!/usr/bin/env node
// Pure-Node PNG icon generator. No external deps.
// Renders a stylized pentagon + neural graph icon at multiple sizes.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "icons");

const COLORS = {
  bgTop: [0x0b, 0x12, 0x20, 255],
  bgBot: [0x1a, 0x24, 0x38, 255],
  penTop: [0xff, 0xd1, 0x66, 255],
  penBot: [0xf4, 0xa2, 0x61, 255],
  stroke: [0x0b, 0x12, 0x20, 255],
};

function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255];
}

// Axis-aligned rounded rect distance (negative inside)
function roundedRectSDF(px, py, cx, cy, w, h, r) {
  const dx = Math.max(Math.abs(px - cx) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(py - cy) - (h / 2 - r), 0);
  return Math.sqrt(dx * dx + dy * dy) - r;
}

// Point-in-polygon via winding / ray cast
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Distance point -> segment
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  const ex = px - qx, ey = py - qy;
  return Math.sqrt(ex * ex + ey * ey);
}

function distToPoly(px, py, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    m = Math.min(m, distToSegment(px, py, a[0], a[1], b[0], b[1]));
  }
  return m;
}

function drawIcon(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const cornerR = maskable ? 0 : 96 * scale;
  const inset = maskable ? 0.1 * size : 0; // safe area inset for maskable

  // Pentagon points (centered in a 512-coord system, then scaled)
  const pent512 = [
    [256, 96], [408, 206], [350, 384], [162, 384], [104, 206],
  ];
  const pent = pent512.map(([x, y]) => {
    const sx = x * scale, sy = y * scale;
    // Contract toward center for maskable safe area
    const cx = size / 2, cy = size / 2;
    return [lerp(cx, sx, 1 - inset / (size / 2) * 0 + (1 - inset * 2 / size)), lerp(cy, sy, 1 - inset * 2 / size)];
  });

  const nodes = [[256, 170], [200, 230], [312, 230], [256, 300]].map(([x, y]) => {
    const sx = x * scale, sy = y * scale;
    const cx = size / 2, cy = size / 2;
    return [lerp(cx, sx, 1 - inset * 2 / size), lerp(cy, sy, 1 - inset * 2 / size)];
  });
  const edges = [
    [nodes[1], nodes[2]],
    [nodes[1], nodes[3]],
    [nodes[2], nodes[3]],
    [nodes[1], nodes[0]],
    [nodes[2], nodes[0]],
  ];

  const strokeW = 8 * scale;
  const edgeStrokeW = 6 * scale;
  const nodeR = 14 * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Background (rounded) with vertical gradient
      const rsdf = roundedRectSDF(x + 0.5, y + 0.5, size / 2, size / 2, size, size, cornerR);
      let a = Math.max(0, Math.min(1, 0.5 - rsdf));
      if (a <= 0) {
        buf[idx + 3] = 0; continue;
      }
      const tBg = y / size;
      let col = mix(COLORS.bgTop, COLORS.bgBot, tBg);

      // Pentagon fill + stroke
      const inside = pointInPoly(x + 0.5, y + 0.5, pent);
      const dPoly = distToPoly(x + 0.5, y + 0.5, pent);
      if (inside) {
        // Gradient inside pentagon vertically
        const minY = Math.min(...pent.map(p => p[1]));
        const maxY = Math.max(...pent.map(p => p[1]));
        const tP = ((y + 0.5) - minY) / (maxY - minY);
        col = mix(COLORS.penTop, COLORS.penBot, Math.max(0, Math.min(1, tP)));
      }
      // Stroke around pentagon edge
      if (dPoly < strokeW / 2) {
        const t = 1 - Math.max(0, dPoly - (strokeW / 2 - 1));
        col = blend(col, COLORS.stroke, Math.max(0, Math.min(1, t)));
      }

      // Edges (dark lines)
      let onEdge = 0;
      for (const [a1, b1] of edges) {
        const d = distToSegment(x + 0.5, y + 0.5, a1[0], a1[1], b1[0], b1[1]);
        if (d < edgeStrokeW / 2) {
          onEdge = Math.max(onEdge, 1 - Math.max(0, d - (edgeStrokeW / 2 - 1)));
        }
      }
      if (onEdge > 0) col = blend(col, COLORS.stroke, Math.min(1, onEdge));

      // Nodes (dark filled circles)
      for (const n of nodes) {
        const dx = x + 0.5 - n[0], dy = y + 0.5 - n[1];
        const d = Math.sqrt(dx * dx + dy * dy) - nodeR;
        if (d < 1) {
          col = blend(col, COLORS.stroke, Math.max(0, Math.min(1, 1 - d)));
        }
      }

      buf[idx] = col[0] | 0;
      buf[idx + 1] = col[1] | 0;
      buf[idx + 2] = col[2] | 0;
      buf[idx + 3] = Math.round(a * 255);
    }
  }
  return encodePNG(size, size, buf);
}

function blend(base, over, alpha) {
  return [
    base[0] * (1 - alpha) + over[0] * alpha,
    base[1] * (1 - alpha) + over[1] * alpha,
    base[2] * (1 - alpha) + over[2] * alpha,
    255,
  ];
}

// --- PNG encoding ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

function write(name, buf) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

write("icon-192.png", drawIcon(192));
write("icon-512.png", drawIcon(512));
write("icon-maskable-512.png", drawIcon(512, { maskable: true }));
write("apple-touch-icon.png", drawIcon(180));
