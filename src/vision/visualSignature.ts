import type { ReferenceImage } from '../types/master';
import type { GrayscaleImage } from './imageUtils';

export interface VisualSignature {
  brightness: number;
  centerContrast: number;
  edgeDensity: number;
  circularity: number;
  colorR: number;
  colorG: number;
  colorB: number;
  saturation: number;
}

const cache = new Map<string, Promise<VisualSignature | null>>();

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function compareVisualSignature(a: VisualSignature, b: VisualSignature): number {
  const d =
    Math.abs(a.brightness - b.brightness) * 0.08 +
    Math.abs(a.centerContrast - b.centerContrast) * 0.24 +
    Math.abs(a.edgeDensity - b.edgeDensity) * 0.22 +
    Math.abs(a.circularity - b.circularity) * 0.22 +
    Math.abs(a.colorR - b.colorR) * 0.06 +
    Math.abs(a.colorG - b.colorG) * 0.06 +
    Math.abs(a.colorB - b.colorB) * 0.06 +
    Math.abs(a.saturation - b.saturation) * 0.06;
  return clamp01(1 - d);
}

export function sampleVisualSignature(
  gray: GrayscaleImage,
  color: ImageData | null,
  cx: number,
  cy: number,
  radius: number,
  edges?: GrayscaleImage
): VisualSignature {
  const n = 32;
  let all = 0, center = 0, ring = 0, edge = 0, sat = 0, r = 0, g = 0, b = 0;
  let centerN = 0, ringN = 0;
  let circularity = 0;

  const readGray = (x: number, y: number) => {
    const ix = Math.max(0, Math.min(gray.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(gray.height - 1, Math.round(y)));
    return gray.data[iy * gray.width + ix] / 255;
  };

  const readColor = (x: number, y: number) => {
    if (!color) return { r: 0.5, g: 0.5, b: 0.5, s: 0 };
    const ix = Math.max(0, Math.min(color.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(color.height - 1, Math.round(y)));
    const i = (iy * color.width + ix) * 4;
    const rr = color.data[i] / 255, gg = color.data[i + 1] / 255, bb = color.data[i + 2] / 255;
    const hi = Math.max(rr, gg, bb), lo = Math.min(rr, gg, bb);
    return { r: rr, g: gg, b: bb, s: hi ? (hi - lo) / hi : 0 };
  };

  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    for (const f of [0.30, 0.72, 1.00]) {
      const rr = Math.max(2, radius * f);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const v = readGray(x, y), c = readColor(x, y);
      all += v; r += c.r; g += c.g; b += c.b; sat += c.s;
      if (f <= 0.30) { center += v; centerN++; }
      if (f >= 0.72) { ring += v; ringN++; }
      if (edges) {
        const ix = Math.max(0, Math.min(edges.width - 1, Math.round(x)));
        const iy = Math.max(0, Math.min(edges.height - 1, Math.round(y)));
        edge += edges.data[iy * edges.width + ix] / 255;
      }
    }
    const outer = readGray(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    const inner = readGray(cx + Math.cos(a) * radius * 0.30, cy + Math.sin(a) * radius * 0.30);
    circularity += Math.abs(outer - inner);
  }

  const count = n * 3;
  const centerMean = center / Math.max(1, centerN);
  const ringMean = ring / Math.max(1, ringN);
  return {
    brightness: all / count,
    centerContrast: clamp01(Math.abs(ringMean - centerMean) * 2.0),
    edgeDensity: edge / count,
    circularity: clamp01(circularity / n * 2.0),
    colorR: r / count,
    colorG: g / count,
    colorB: b / count,
    saturation: sat / count,
  };
}

async function loadReference(reference: ReferenceImage): Promise<VisualSignature | null> {
  if (!reference.imageUrl) return null;
  const key = reference.id + ':' + reference.imageUrl.length;
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = new Promise<VisualSignature | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 128, 128);
        const data = ctx.getImageData(0, 0, 128, 128);
        const grayData = new Uint8Array(128 * 128);
        for (let i = 0, p = 0; i < grayData.length; i++, p += 4) {
          grayData[i] = Math.round(data.data[p] * 0.299 + data.data[p + 1] * 0.587 + data.data[p + 2] * 0.114);
        }
        resolve(sampleVisualSignature({ width: 128, height: 128, data: grayData }, data, 64, 64, 38));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = reference.imageUrl;
  });
  cache.set(key, promise);
  return promise;
}

export async function buildVisualReferenceMap(references: ReferenceImage[]) {
  const result = new Map<string, VisualSignature>();
  await Promise.all(references.map(async (ref) => {
    if (!ref.roiId) return;
    const signature = await loadReference(ref);
    if (signature) result.set(ref.roiId, signature);
  }));
  return result;
}
