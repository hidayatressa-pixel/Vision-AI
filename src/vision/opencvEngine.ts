/**
 * OpenCV 5 browser vision adapter.
 *
 * OpenCV is a real inspection stage: preprocessing + circle detection.
 * The deterministic RVI rules remain the final authority for OK/NG/ERROR.
 */

import { loadOpenCV } from '@opencvjs/web';
import type { GrayscaleImage } from './imageUtils';
import type { Position2D } from '../types/master';

let cvPromise: ReturnType<typeof loadOpenCV> | null = null;

function getOpenCV(): ReturnType<typeof loadOpenCV> {
  if (!cvPromise) {
    cvPromise = loadOpenCV().catch((error) => {
      cvPromise = null;
      throw error;
    });
  }
  return cvPromise;
}

export interface OpenCVPreprocessResult {
  gray: GrayscaleImage;
  edgeDensity: number;
  processingMs: number;
}

export interface OpenCVCircle {
  center: Position2D;
  radius: number;
  confidence: number;
}

export function initializeOpenCV(): ReturnType<typeof loadOpenCV> {
  return getOpenCV();
}

/**
 * RGBA -> grayscale -> Gaussian denoise -> histogram equalization -> Canny.
 * The normalized grayscale output is consumed by the existing RVI engines.
 */
export async function preprocessInspectionFrame(
  frameData: ImageData
): Promise<OpenCVPreprocessResult> {
  const started = performance.now();
  const cv = await getOpenCV();

  const source = cv.matFromImageData(frameData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const equalized = new cv.Mat();
  const edges = new cv.Mat();

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.equalizeHist(blurred, equalized);
    cv.Canny(equalized, edges, 60, 140);

    let edgePixels = 0;
    for (let i = 0; i < edges.data.length; i++) {
      if (edges.data[i] > 0) edgePixels++;
    }

    const grayData = new Uint8Array(equalized.data.length);
    grayData.set(equalized.data);

    return {
      gray: { width: equalized.cols, height: equalized.rows, data: grayData },
      edgeDensity:
        equalized.rows * equalized.cols > 0
          ? edgePixels / (equalized.rows * equalized.cols)
          : 0,
      processingMs: performance.now() - started,
    };
  } finally {
    source.delete();
    gray.delete();
    blurred.delete();
    equalized.delete();
    edges.delete();
  }
}

/**
 * Candidate detector only. The existing master/ROI/tolerance/rule layers
 * remain authoritative for the final judgement.
 */
export async function detectOpenCVCircles(
  frame: GrayscaleImage,
  minRadiusPx: number,
  maxRadiusPx: number
): Promise<OpenCVCircle[]> {
  const cv = await getOpenCV();
  const mat = new cv.Mat(frame.height, frame.width, cv.CV_8UC1);
  const blurred = new cv.Mat();
  const circles = new cv.Mat();

  try {
    mat.data.set(frame.data);
    cv.GaussianBlur(mat, blurred, new cv.Size(5, 5), 1.2, 1.2, cv.BORDER_DEFAULT);
    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1.2,
      Math.max(10, minRadiusPx * 1.5),
      100,
      24,
      Math.max(3, Math.floor(minRadiusPx)),
      Math.max(minRadiusPx + 1, Math.ceil(maxRadiusPx))
    );

    const values = circles.data32F;
    const result: OpenCVCircle[] = [];
    for (let i = 0; i + 2 < values.length; i += 3) {
      const x = values[i];
      const y = values[i + 1];
      const radius = values[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) continue;

      result.push({
        center: { x, y },
        radius,
        confidence: 0.80,
      });
    }
    return result;
  } finally {
    mat.delete();
    blurred.delete();
    circles.delete();
  }
}
