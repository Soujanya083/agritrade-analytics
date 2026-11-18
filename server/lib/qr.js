// lib/qr.js - a small, dependency-free QR Code generator (byte mode, error correction level M, versions 1-10).
//
// Why hand-written: the deployment installs from a lock file, and a QR library would need a new
// dependency. A shipment link is a short URL, which this covers (up to 213 bytes). The output is a
// boolean matrix; the API returns it and the React app draws it as SVG (no HTML is ever injected).
// Verified in test/qr.test.js by rendering the matrix and decoding it with an independent decoder.

// ---- Reed-Solomon over GF(256), primitive polynomial 0x11D --------------------------------
const EXP = new Array(512);
const LOG = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function reedSolomon(data, ecLength) {
  const gen = generatorPolynomial(ecLength);
  const result = new Array(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < ecLength; i += 1) result[i] ^= gfMul(gen[i + 1], factor);
  }
  return result;
}

// ---- Level M tables for versions 1-10: [ecCodewordsPerBlock, [blocks, dataPerBlock], [blocks, dataPerBlock]] ----
const LEVEL_M = {
  1: [10, [1, 16], [0, 0]],
  2: [16, [1, 28], [0, 0]],
  3: [26, [1, 44], [0, 0]],
  4: [18, [2, 32], [0, 0]],
  5: [24, [2, 43], [0, 0]],
  6: [16, [4, 27], [0, 0]],
  7: [18, [4, 31], [0, 0]],
  8: [22, [2, 38], [2, 39]],
  9: [22, [3, 36], [2, 37]],
  10: [26, [4, 43], [1, 44]],
};
const ALIGNMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const MAX_VERSION = 10;
const dataCapacity = (v) => LEVEL_M[v][1][0] * LEVEL_M[v][1][1] + LEVEL_M[v][2][0] * LEVEL_M[v][2][1];
// the 4-bit mode and the 8- or 16-bit character count come first, so the bytes that fit are:
const byteCapacity = (v) => Math.floor((dataCapacity(v) * 8 - 4 - (v >= 10 ? 16 : 8)) / 8); // 14, 26, 42, 62, 84, 106, 122, 152, 180, 213

// ---- Bit buffer ----------------------------------------------------------------------------
function buildDataCodewords(bytes, version) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  push(0b0100, 4);                              // byte mode
  push(bytes.length, version >= 10 ? 16 : 8);   // character count
  bytes.forEach((b) => push(b, 8));
  const capacityBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  for (let pad = 0xec; out.length < dataCapacity(version); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function interleave(dataCodewords, version) {
  const [ecLen, [b1, d1], [b2, d2]] = LEVEL_M[version];
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < b1 + b2; i += 1) {
    const size = i < b1 ? d1 : d2;
    const data = dataCodewords.slice(offset, offset + size);
    offset += size;
    blocks.push({ data, ec: reedSolomon(data, ecLen) });
  }
  const out = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i += 1) blocks.forEach((b) => { if (i < b.data.length) out.push(b.data[i]); });
  for (let i = 0; i < ecLen; i += 1) blocks.forEach((b) => out.push(b.ec[i]));
  return out;
}

// ---- Matrix construction -------------------------------------------------------------------
function makeMatrix(version) {
  const size = 17 + 4 * version;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, dark) => { modules[r][c] = dark; reserved[r][c] = true; };

  const finder = (top, left) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inRing && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, dark);
      }
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

  const centers = ALIGNMENT[version];
  centers.forEach((cy, i) => centers.forEach((cx, j) => {
    const overlapsFinder = (i === 0 && j === 0) || (i === 0 && j === centers.length - 1) || (i === centers.length - 1 && j === 0);
    if (overlapsFinder) return;
    for (let r = -2; r <= 2; r += 1) {
      for (let c = -2; c <= 2; c += 1) set(cy + r, cx + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
  }));

  // reserve format information areas and the dark module
  for (let i = 0; i < 9; i += 1) { reserved[8][i] = true; reserved[i][8] = true; }
  for (let i = 0; i < 8; i += 1) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }
  set(size - 8, 8, true);

  if (version >= 7) { // version information blocks
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < 3; j += 1) { reserved[i][size - 11 + j] = true; reserved[size - 11 + j][i] = true; }
  }
  return { size, modules, reserved };
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function placeData(matrix, codewords, mask) {
  const { size, modules, reserved } = matrix;
  const bits = [];
  codewords.forEach((cw) => { for (let i = 7; i >= 0; i -= 1) bits.push((cw >>> i) & 1); });
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1; // skip the vertical timing column
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (reserved[row][c]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        bitIndex += 1;
        modules[row][c] = bit !== MASKS[mask](row, c);
      }
    }
    upward = !upward;
  }
}

function bchRemainder(value, generator, valueBits, genBits) {
  let v = value << (genBits - 1);
  for (let i = valueBits - 1; i >= 0; i -= 1) if ((v >>> (i + genBits - 1)) & 1) v ^= generator << i;
  return v;
}

function drawFormat(matrix, mask) {
  const { size, modules } = matrix;
  const data = (0b00 << 3) | mask; // error correction level M = 00
  const bits = ((data << 10) | bchRemainder(data, 0x537, 5, 11)) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  // first copy, around the top-left finder (row, column)
  for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) modules[8][14 - i] = bit(i);
  // second copy, split between the other two finders
  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = bit(i);
  modules[size - 8][8] = true; // dark module
}

function drawVersion(matrix, version) {
  if (version < 7) return;
  const { size, modules } = matrix;
  const bits = (version << 12) | bchRemainder(version, 0x1f25, 6, 13);
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = (i % 3) + size - 11;
    modules[a][b] = dark;
    modules[b][a] = dark;
  }
}

function penalty(modules) {
  const n = modules.length;
  let score = 0;
  const runScore = (line) => {
    let s = 0; let run = 1;
    for (let i = 1; i < n; i += 1) {
      if (line[i] === line[i - 1]) { run += 1; } else { if (run >= 5) s += run - 2; run = 1; }
    }
    if (run >= 5) s += run - 2;
    return s;
  };
  for (let i = 0; i < n; i += 1) {
    score += runScore(modules[i]);
    score += runScore(modules.map((row) => row[i]));
  }
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversed = [...pattern].reverse();
  const matches = (get, start, p) => p.every((v, k) => get(start + k) === v);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= n - 11; j += 1) {
      const row = (k) => modules[i][k];
      const col = (k) => modules[k][i];
      if (matches(row, j, pattern) || matches(row, j, reversed)) score += 40;
      if (matches(col, j, pattern) || matches(col, j, reversed)) score += 40;
    }
  }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

// text -> { version, size, mask, modules: boolean[][] }. Throws RangeError when the text is too long.
function encodeQr(text, { mask: forcedMask } = {}) {
  const bytes = Array.from(Buffer.from(String(text), 'utf8'));
  let version = 1;
  while (version <= MAX_VERSION && bytes.length > byteCapacity(version)) version += 1;
  if (version > MAX_VERSION) throw new RangeError(`Text is too long for this QR encoder (${bytes.length} bytes, max ${byteCapacity(MAX_VERSION)})`);

  const codewords = interleave(buildDataCodewords(bytes, version), version);
  const build = (mask) => {
    const matrix = makeMatrix(version);
    placeData(matrix, codewords, mask);
    drawFormat(matrix, mask);
    drawVersion(matrix, version);
    return matrix.modules;
  };
  if (forcedMask !== undefined) return { version, size: 17 + 4 * version, mask: forcedMask, modules: build(forcedMask) };

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const modules = build(mask);
    const score = penalty(modules);
    if (!best || score < best.score) best = { mask, modules, score };
  }
  return { version, size: 17 + 4 * version, mask: best.mask, modules: best.modules };
}

module.exports = { encodeQr, byteCapacity, MAX_VERSION };
