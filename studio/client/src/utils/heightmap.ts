// 2D Simplex noise + fbm → grayscale PNG as base64

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const grad2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function buildPerm(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let s = seed | 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [base[i], base[j]] = [base[j]!, base[i]!];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255]!;
  return p;
}

function simplex2d(x: number, y: number, perm: Uint8Array): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255, jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const g = grad2[perm[ii + perm[jj]!]! % 8]!;
    n0 = t0 * t0 * (g[0]! * x0 + g[1]! * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const g = grad2[perm[ii + i1 + perm[jj + j1]!]! % 8]!;
    n1 = t1 * t1 * (g[0]! * x1 + g[1]! * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const g = grad2[perm[ii + 1 + perm[jj + 1]!]! % 8]!;
    n2 = t2 * t2 * (g[0]! * x2 + g[1]! * y2);
  }

  return 70 * (n0 + n1 + n2);
}

export interface HeightmapParams {
  scale: number;
  octaves: number;
  amplitude: number;
  lacunarity: number;
  persistence: number;
  resolution: number;
}

function crc32(buf: Uint8Array): number {
  const table = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]!) & 0xff]!;
  return (c ^ 0xffffffff) >>> 0;
}

let _crc32Table: Uint32Array | null = null;
function crc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  _crc32Table = t;
  return t;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const combined = new Uint8Array(typeBytes.length + data.length);
  combined.set(typeBytes);
  combined.set(data, 4);
  const crc = crc32(combined);
  const out = new Uint8Array(4 + combined.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(combined, 4);
  view.setUint32(4 + combined.length, crc);
  return out;
}

// Minimal deflate: store blocks only (no compression), valid zlib stream
function zlibStore(data: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const numBlocks = Math.ceil(data.length / maxBlock) || 1;
  const out = new Uint8Array(2 + numBlocks * 5 + data.length + 4);
  let pos = 0;
  out[pos++] = 0x78; // CMF
  out[pos++] = 0x01; // FLG
  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlock;
    const len = Math.min(maxBlock, data.length - start);
    const last = i === numBlocks - 1 ? 1 : 0;
    out[pos++] = last;
    out[pos++] = len & 0xff;
    out[pos++] = (len >> 8) & 0xff;
    out[pos++] = ~len & 0xff;
    out[pos++] = (~len >> 8) & 0xff;
    out.set(data.subarray(start, start + len), pos);
    pos += len;
  }
  const adler = adler32(data);
  out[pos++] = (adler >> 24) & 0xff;
  out[pos++] = (adler >> 16) & 0xff;
  out[pos++] = (adler >> 8) & 0xff;
  out[pos++] = adler & 0xff;
  return out.subarray(0, pos);
}

function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Produce a true grayscale PNG (color_type=0) — required by rockpng
export function generateHeightmapPNG(params: HeightmapParams, seed: number): string {
  const { scale, octaves, amplitude, lacunarity, persistence, resolution } = params;
  const perm = buildPerm(seed);
  const pixels = new Uint8Array(resolution * resolution);
  const offset = seed * 17.31;

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      let value = 0;
      let amp = amplitude;
      let freq = scale / resolution;
      for (let o = 0; o < octaves; o++) {
        value += amp * simplex2d(x * freq + offset, y * freq + offset, perm);
        freq *= lacunarity;
        amp *= persistence;
      }
      pixels[y * resolution + x] = Math.max(0, Math.min(255, Math.floor((value + 1) * 0.5 * 255)));
    }
  }

  // Build raw scanlines: filter byte (0) + row data
  const raw = new Uint8Array(resolution * (1 + resolution));
  for (let y = 0; y < resolution; y++) {
    raw[y * (1 + resolution)] = 0; // no filter
    raw.set(pixels.subarray(y * resolution, (y + 1) * resolution), y * (1 + resolution) + 1);
  }

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, resolution);
  ihdrView.setUint32(4, resolution);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 0;  // color type: grayscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const compressed = zlibStore(raw);
  const ihdrChunk = pngChunk("IHDR", ihdr);
  const idatChunk = pngChunk("IDAT", compressed);
  const iendChunk = pngChunk("IEND", new Uint8Array(0));

  const png = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let pos = 0;
  png.set(sig, pos); pos += sig.length;
  png.set(ihdrChunk, pos); pos += ihdrChunk.length;
  png.set(idatChunk, pos); pos += idatChunk.length;
  png.set(iendChunk, pos);

  let binary = "";
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i]!);
  return btoa(binary);
}
