/**
 * Computer Vision Image Utilities
 * Optimized canvas pixel manipulation for edge/browser inspection.
 */

export interface GrayscaleImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Converts ImageData to a fast 1-channel Grayscale representation
 */
export function toGrayscale(imgData: ImageData): GrayscaleImage {
  const { width, height, data } = imgData;
  const gray = new Uint8Array(width * height);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Standard luminosity weights: 0.299 R + 0.587 G + 0.114 B
    gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  return { width, height, data: gray };
}

/**
 * Fast 3x3 Box Blur for noise suppression
 */
export function boxBlur(gray: GrayscaleImage): GrayscaleImage {
  const { width, height, data } = gray;
  const output = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    const yOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const row = (y + dy) * width;
        sum += data[row + x - 1] + data[row + x] + data[row + x + 1];
      }
      output[yOffset + x] = Math.round(sum / 9);
    }
  }

  return { width, height, data: output };
}

/**
 * Sobel Edge Gradient Magnitude
 */
export function sobelEdges(gray: GrayscaleImage): GrayscaleImage {
  const { width, height, data } = gray;
  const edges = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Sobel horizontal
      const gx =
        -data[(y - 1) * width + (x - 1)] +
        data[(y - 1) * width + (x + 1)] -
        2 * data[y * width + (x - 1)] +
        2 * data[y * width + (x + 1)] -
        data[(y + 1) * width + (x - 1)] +
        data[(y + 1) * width + (x + 1)];

      // Sobel vertical
      const gy =
        -data[(y - 1) * width + (x - 1)] -
        2 * data[(y - 1) * width + x] -
        data[(y - 1) * width + (x + 1)] +
        data[(y + 1) * width + (x - 1)] +
        2 * data[(y + 1) * width + x] +
        data[(y + 1) * width + (x + 1)];

      const mag = Math.min(255, Math.hypot(gx, gy));
      edges[y * width + x] = mag;
    }
  }

  return { width, height, data: edges };
}

/**
 * Computes average brightness and contrast in a sub-rectangle
 */
export function getRegionStats(
  gray: GrayscaleImage,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { mean: number; variance: number; min: number; max: number } {
  const x0 = Math.max(0, Math.floor(rx));
  const y0 = Math.max(0, Math.floor(ry));
  const x1 = Math.min(gray.width, Math.ceil(rx + rw));
  const y1 = Math.min(gray.height, Math.ceil(ry + rh));

  let sum = 0;
  let min = 255;
  let max = 0;
  const total = (x1 - x0) * (y1 - y0);

  if (total <= 0) return { mean: 0, variance: 0, min: 0, max: 0 };

  for (let y = y0; y < y1; y++) {
    const row = y * gray.width;
    for (let x = x0; x < x1; x++) {
      const val = gray.data[row + x];
      sum += val;
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  const mean = sum / total;
  let varSum = 0;

  for (let y = y0; y < y1; y++) {
    const row = y * gray.width;
    for (let x = x0; x < x1; x++) {
      const diff = gray.data[row + x] - mean;
      varSum += diff * diff;
    }
  }

  return { mean, variance: varSum / total, min, max };
}

/**
 * Normalized Cross Correlation (NCC) template matching in search window
 */
export function matchTemplateNCC(
  image: GrayscaleImage,
  template: GrayscaleImage,
  searchX: number,
  searchY: number,
  searchW: number,
  searchH: number
): { bestX: number; bestY: number; score: number } {
  const sx = Math.max(0, Math.floor(searchX));
  const sy = Math.max(0, Math.floor(searchY));
  const maxEx = Math.min(image.width - template.width, Math.floor(searchX + searchW));
  const maxEy = Math.min(image.height - template.height, Math.floor(searchY + searchH));

  const tw = template.width;
  const th = template.height;
  const tCount = tw * th;

  // Template mean and std dev
  let tSum = 0;
  for (let i = 0; i < tCount; i++) {
    tSum += template.data[i];
  }
  const tMean = tSum / tCount;

  let tNormSq = 0;
  for (let i = 0; i < tCount; i++) {
    const diff = template.data[i] - tMean;
    tNormSq += diff * diff;
  }
  const tStd = Math.sqrt(tNormSq) || 1;

  let bestScore = -1;
  let bestX = sx;
  let bestY = sy;

  // Step size 1 or 2 for performance
  const step = 2;

  for (let y = sy; y <= maxEy; y += step) {
    for (let x = sx; x <= maxEx; x += step) {
      let patchSum = 0;
      for (let ty = 0; ty < th; ty++) {
        const row = (y + ty) * image.width;
        for (let tx = 0; tx < tw; tx++) {
          patchSum += image.data[row + x + tx];
        }
      }
      const patchMean = patchSum / tCount;

      let crossSum = 0;
      let patchNormSq = 0;

      for (let ty = 0; ty < th; ty++) {
        const iRow = (y + ty) * image.width;
        const tRow = ty * tw;
        for (let tx = 0; tx < tw; tx++) {
          const tVal = template.data[tRow + tx] - tMean;
          const pVal = image.data[iRow + x + tx] - patchMean;
          crossSum += tVal * pVal;
          patchNormSq += pVal * pVal;
        }
      }

      const pStd = Math.sqrt(patchNormSq) || 1;
      const ncc = crossSum / (tStd * pStd);

      if (ncc > bestScore) {
        bestScore = ncc;
        bestX = x;
        bestY = y;
      }
    }
  }

  return {
    bestX: bestX + Math.floor(tw / 2),
    bestY: bestY + Math.floor(th / 2),
    score: Math.max(0, Math.min(1, (bestScore + 1) / 2)), // map -1..1 to 0..1
  };
}

/**
 * Calculates absolute frame difference (motion delta) in a detection box
 */
export function calculateMotionDelta(
  current: GrayscaleImage,
  previous: GrayscaleImage | null,
  box: { x: number; y: number; width: number; height: number }
): number {
  if (!previous) return 0;
  if (current.width !== previous.width || current.height !== previous.height) return 0;

  const x0 = Math.floor(box.x * current.width);
  const y0 = Math.floor(box.y * current.height);
  const x1 = Math.min(current.width, Math.floor((box.x + box.width) * current.width));
  const y1 = Math.min(current.height, Math.floor((box.y + box.height) * current.height));

  let diffSum = 0;
  let count = 0;

  // Subsample every 3 pixels for high FPS
  for (let y = y0; y < y1; y += 3) {
    const row = y * current.width;
    for (let x = x0; x < x1; x += 3) {
      const idx = row + x;
      diffSum += Math.abs(current.data[idx] - previous.data[idx]);
      count++;
    }
  }

  return count > 0 ? diffSum / count : 0;
}
