/**
 * OpenCV 5 browser vision adapter.
 *
 * OpenCV is used for the inspection-frame preprocessing stage before the
 * existing deterministic RVI alignment/ROI engines run. This keeps the
 * current inspection rules intact while moving the image-processing front
 * end to real OpenCV 5 WebAssembly.
 */

import { loadOpenCV, type OpenCV } from '@opencvjs/web';
import type { GrayscaleImage } from './imageUtils';

let cvPromise: Promise<OpenCV> | null = null;

function getOpenCV(): Promise<OpenCV> {
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

export async function initializeOpenCV(): Promise<OpenCV> {
  return getOpenCV();
}

/**
 * Converts an RGBA camera frame into an OpenCV-processed grayscale image.
 *
 * Pipeline:
 *   RGBA -> grayscale -> Gaussian denoise -> histogram equalization
 *   -> Canny edge analysis
 *
 * The equalized grayscale image is passed to the existing RVI inspection
 * algorithms. Canny is also measured so the inspection pipeline can expose
 * a real OpenCV quality signal without changing the deterministic judgement
 * rules yet.
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
    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(5, 5),
      0,
      0,
      cv.BORDER_DEFAULT
    );
    cv.equalizeHist(blurred, equalized);
    cv.Canny(equalized, edges, 60, 140);

    const pixelCount = edges.rows * edges.cols;
    let edgePixels = 0;
    for (let i = 0; i < edges.data.length; i++) {
      if (edges.data[i] > 0) edgePixels++;
    }

    const grayData = new Uint8Array(equalized.data.length);
    grayData.set(equalized.data);

    return {
      gray: {
        width: equalized.cols,
        height: equalized.rows,
        data: grayData,
      },
      edgeDensity: pixelCount > 0 ? edgePixels / pixelCount : 0,
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
