/**
 * ROI Detection Engine
 * Inspects transformed Regions of Interest for screw presence, position tolerance, and extra objects.
 */

import { AlignmentResult, ExtraDetectedObject, ROIInspectionResult } from '../types/inspection';
import { InspectionROI, Position2D, ToleranceConfig } from '../types/master';
import { alignmentEngine } from './alignmentEngine';
import { GrayscaleImage, sobelEdges } from './imageUtils';
import { detectOpenCVCircles, OpenCVCircle } from './opencvEngine';

export class ROIInspector {
  /**
   * Inspects all transformed ROIs and scans for unexpected extra objects
   */
  public async inspectROIs(
    frame: GrayscaleImage,
    rois: InspectionROI[],
    alignment: AlignmentResult,
    tolerance: ToleranceConfig,
    masterWidth: number,
    masterHeight: number
  ): Promise<{
    roiResults: ROIInspectionResult[];
    extraObjects: ExtraDetectedObject[];
    detectedScrewCount: number;
  }> {
    const edges = sobelEdges(frame);
    const minRadiusPx = Math.max(3, Math.round(Math.min(frame.width, frame.height) * 0.008));
    const maxRadiusPx = Math.max(minRadiusPx + 2, Math.round(Math.min(frame.width, frame.height) * 0.055));
    let openCVCircles: OpenCVCircle[] = [];
    try {
      openCVCircles = await detectOpenCVCircles(frame, minRadiusPx, maxRadiusPx);
    } catch (error) {
      // OpenCV candidate detection is non-authoritative; retain the existing
      // deterministic detector if the WASM path is unavailable.
      console.warn('[ROIInspector] OpenCV circle detection unavailable:', error);
    }

    const results: ROIInspectionResult[] = [];
    let detectedScrewCount = 0;

    // Tolerance pixels are calibrated in the master coordinate system.
    // Scale them to the actual camera frame instead of treating 25px as a
    // universal value. This keeps the same physical tolerance at 720p, 1080p,
    // and other camera resolutions.
    const masterMinDimension = Math.max(1, Math.min(masterWidth, masterHeight));
    const frameMinDimension = Math.min(frame.width, frame.height);
    const framePxPerMasterPx = frameMinDimension / masterMinDimension;
    const configuredMaxOffsetPx = Math.max(1, tolerance.maxPositionOffsetPx * framePxPerMasterPx);
    const pxPerMm = Math.max(0.001, configuredMaxOffsetPx / Math.max(0.001, tolerance.maxPositionOffsetMm));

    const detectedScrewPositions: Position2D[] = [];

    for (const roi of rois) {
      // 1. Compute transformed expected position in current frame pixels
      const transformedPx = alignmentEngine.transformMasterPoint(
        { x: roi.x, y: roi.y },
        frame.width,
        frame.height,
        alignment,
        masterWidth,
        masterHeight
      );

      // Search radius in pixels
      const expectedRadiusPx = roi.radius * Math.min(frame.width, frame.height);
      const toleranceRadiusPx = Math.max(
        configuredMaxOffsetPx,
        roi.toleranceRadius * Math.min(frame.width, frame.height)
      );

      const searchRadius = toleranceRadiusPx * 1.5;

      // 2. Scan localized search neighborhood for circular screw signature
      const detection = this.detectScrewInRegion(
        frame,
        edges,
        transformedPx.x,
        transformedPx.y,
        searchRadius,
        expectedRadiusPx,
        openCVCircles
      );

      // 3. Evaluate tolerance and confidence
      const minConfidence = roi.minConfidence || tolerance.minScrewConfidence || 0.65;
      const isPresent = detection.isPresent && detection.confidence >= minConfidence;

      let positionOffsetPx = 0;
      let positionOffsetMm = 0;
      let isWithinTolerance = true;
      let failureReason: string | undefined = undefined;

      if (isPresent && detection.center) {
        positionOffsetPx = Math.hypot(
          detection.center.x - transformedPx.x,
          detection.center.y - transformedPx.y
        );
        positionOffsetMm = positionOffsetPx / pxPerMm;

        // Position tolerance check
        if (positionOffsetPx > toleranceRadiusPx) {
          isWithinTolerance = false;
          failureReason = `${roi.name} Position Out of Tolerance (+${positionOffsetMm.toFixed(1)}mm)`;
        } else {
          detectedScrewCount++;
          detectedScrewPositions.push(detection.center);
        }
      } else {
        failureReason = `${roi.name} Missing`;
      }

      let status: 'PASS' | 'FAIL' | 'WARNING' = 'PASS';
      if (!isPresent) {
        status = roi.isRequired ? 'FAIL' : 'WARNING';
      } else if (!isWithinTolerance) {
        status = 'FAIL';
      }

      results.push({
        roiId: roi.id,
        roiName: roi.name,
        objectType: roi.objectType,
        masterPosition: { x: roi.x, y: roi.y },
        expectedTransformedPosition: {
          x: transformedPx.x / frame.width,
          y: transformedPx.y / frame.height,
        },
        actualDetectedPosition: detection.center
          ? {
              x: detection.center.x / frame.width,
              y: detection.center.y / frame.height,
            }
          : null,
        positionOffsetPx: Math.round(positionOffsetPx * 10) / 10,
        positionOffsetMm: Math.round(positionOffsetMm * 100) / 100,
        isWithinTolerance,
        confidence: Math.round(detection.confidence * 100) / 100,
        isPresent,
        status,
        failureReason,
      });
    }

    // 4. Scan for extra unexpected screws within the workpiece region
    const extraObjects = this.scanForExtraScrews(
      frame,
      edges,
      rois,
      alignment,
      detectedScrewPositions,
      tolerance,
      masterWidth,
      masterHeight,
      configuredMaxOffsetPx
    );

    return {
      roiResults: results,
      extraObjects,
      detectedScrewCount,
    };
  }

  /**
   * Screw feature detection using circular edge symmetry & radial gradient
   */
  private detectScrewInRegion(
    frame: GrayscaleImage,
    edges: GrayscaleImage,
    expX: number,
    expY: number,
    searchRadius: number,
    expectedRadius: number,
    openCVCircles: OpenCVCircle[] = []
  ): { isPresent: boolean; center: Position2D | null; confidence: number } {
    const x0 = Math.max(expectedRadius, Math.floor(expX - searchRadius));
    const y0 = Math.max(expectedRadius, Math.floor(expY - searchRadius));
    const x1 = Math.min(frame.width - expectedRadius, Math.ceil(expX + searchRadius));
    const y1 = Math.min(frame.height - expectedRadius, Math.ceil(expY + searchRadius));

    // Prefer an OpenCV Hough-circle candidate inside the transformed ROI.
    // The candidate is still checked against the configured master tolerance;
    // OpenCV never overrides the master/rule decision.
    const cvCandidate = openCVCircles
      .filter((circle) => {
        const d = Math.hypot(circle.center.x - expX, circle.center.y - expY);
        return d <= searchRadius && circle.radius >= expectedRadius * 0.55 && circle.radius <= expectedRadius * 1.65;
      })
      .sort((a, b) => {
        const da = Math.hypot(a.center.x - expX, a.center.y - expY);
        const db = Math.hypot(b.center.x - expX, b.center.y - expY);
        return da - db;
      })[0];

    if (cvCandidate) {
      const distance = Math.hypot(cvCandidate.center.x - expX, cvCandidate.center.y - expY);
      const distanceFactor = Math.max(0, 1 - distance / Math.max(searchRadius, 1));
      const radiusFactor = Math.max(
        0,
        1 - Math.abs(cvCandidate.radius - expectedRadius) / Math.max(expectedRadius, 1)
      );
      const confidence = Math.min(0.99, cvCandidate.confidence * (0.70 + 0.30 * radiusFactor) * (0.70 + 0.30 * distanceFactor));
      if (confidence >= 0.55) {
        return { isPresent: true, center: cvCandidate.center, confidence };
      }
    }

    let bestScore = 0;
    let bestCenter: Position2D | null = null;

    const step = 2;
    const testR = Math.max(12, Math.round(expectedRadius));

    for (let cy = y0; cy <= y1; cy += step) {
      for (let cx = x0; cx <= x1; cx += step) {
        // Measure circular symmetry: sample 12 radial points along radius testR
        let edgeSum = 0;
        let ringIntensitySum = 0;
        const numSamples = 12;

        for (let i = 0; i < numSamples; i++) {
          const angle = (i * 2 * Math.PI) / numSamples;
          const sx = Math.round(cx + testR * Math.cos(angle));
          const sy = Math.round(cy + testR * Math.sin(angle));

          if (sx >= 0 && sx < frame.width && sy >= 0 && sy < frame.height) {
            edgeSum += edges.data[sy * frame.width + sx];
            ringIntensitySum += frame.data[sy * frame.width + sx];
          }
        }

        // Center point intensity (countersunk center/slot is darker than metallic rim)
        const centerIntensity = frame.data[cy * frame.width + cx];
        const avgRingIntensity = ringIntensitySum / numSamples;

        // Circular edge score
        const avgEdge = edgeSum / numSamples;
        // Contrast difference (rim vs center)
        const contrast = Math.max(0, avgRingIntensity - centerIntensity + 40);

        // Distance penalty from expected transformed point
        const dist = Math.hypot(cx - expX, cy - expY);
        const distFactor = Math.max(0.4, 1.0 - (dist / (searchRadius * 1.5)));

        const score = avgEdge * 0.7 + contrast * 0.5;
        const totalScore = score * distFactor;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestCenter = { x: cx, y: cy };
        }
      }
    }

    // Normalizing confidence score between 0.0 and 1.0
    // Real industrial screws produce edge scores > 70 with contrast > 40
    let confidence = 0;
    if (bestScore > 35) {
      confidence = Math.min(0.99, Math.max(0.2, (bestScore - 20) / 90));
    }

    const isPresent = confidence >= 0.55 && bestCenter !== null;

    return {
      isPresent,
      center: isPresent ? bestCenter : null,
      confidence,
    };
  }

  /**
   * Scan workpiece area for extra screws not belonging to any expected ROI
   */
  private scanForExtraScrews(
    frame: GrayscaleImage,
    edges: GrayscaleImage,
    rois: InspectionROI[],
    alignment: AlignmentResult,
    knownScrewCenters: Position2D[],
    tolerance: ToleranceConfig,
    masterWidth: number,
    masterHeight: number,
    configuredMaxOffsetPx: number
  ): ExtraDetectedObject[] {
    const extra: ExtraDetectedObject[] = [];
    const minScrewDistancePx = Math.max(12, configuredMaxOffsetPx * 1.8);

    // Build the search area from the transformed master ROIs instead of assuming
    // the workpiece is axis-aligned at the frame centre. This keeps extra-object
    // detection consistent with the alignment transform.
    const transformed = rois.map((roi) =>
      alignmentEngine.transformMasterPoint(
        { x: roi.x, y: roi.y },
        frame.width,
        frame.height,
        alignment,
        masterWidth,
        masterHeight
      )
    );

    if (transformed.length === 0) return extra;

    const xs = transformed.map((p) => p.x);
    const ys = transformed.map((p) => p.y);
    const marginX = Math.max(40, frame.width * 0.06);
    const marginY = Math.max(40, frame.height * 0.06);

    const x0 = Math.max(30, Math.floor(Math.min(...xs) - marginX));
    const y0 = Math.max(30, Math.floor(Math.min(...ys) - marginY));
    const x1 = Math.min(frame.width - 30, Math.ceil(Math.max(...xs) + marginX));
    const y1 = Math.min(frame.height - 30, Math.ceil(Math.max(...ys) + marginY));

    const step = 16;
    const rTest = 16;

    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        let minDistToKnown = Infinity;
        for (const known of knownScrewCenters) {
          const d = Math.hypot(x - known.x, y - known.y);
          if (d < minDistToKnown) minDistToKnown = d;
        }

        if (minDistToKnown > minScrewDistancePx) {
          const check = this.detectScrewInRegion(frame, edges, x, y, 12, rTest);
          if (check.isPresent && check.confidence >= 0.78 && check.center) {
            const duplicate = extra.some((item) => {
              const px = item.position.x * frame.width;
              const py = item.position.y * frame.height;
              return Math.hypot(px - check.center!.x, py - check.center!.y) < minScrewDistancePx;
            });
            if (!duplicate) {
              extra.push({
                id: `extra-screw-${extra.length + 1}`,
                position: {
                  x: check.center.x / frame.width,
                  y: check.center.y / frame.height,
                },
                confidence: Math.round(check.confidence * 100) / 100,
                distanceToNearestExpected: Math.round(minDistToKnown),
              });
            }
          }
        }
      }
    }

    return extra;
  }
}

export const roiInspector = new ROIInspector();
