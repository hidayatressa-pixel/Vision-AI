/**
 * ROI Detection Engine
 * Inspects transformed Regions of Interest for screw presence, position tolerance, and extra objects.
 */

import { AlignmentResult, ExtraDetectedObject, ROIInspectionResult } from '../types/inspection';
import { InspectionROI, Position2D, ToleranceConfig } from '../types/master';
import { alignmentEngine } from './alignmentEngine';
import { GrayscaleImage, sobelEdges } from './imageUtils';

export class ROIInspector {
  /**
   * Inspects all transformed ROIs and scans for unexpected extra objects
   */
  public inspectROIs(
    frame: GrayscaleImage,
    rois: InspectionROI[],
    alignment: AlignmentResult,
    tolerance: ToleranceConfig
  ): {
    roiResults: ROIInspectionResult[];
    extraObjects: ExtraDetectedObject[];
    detectedScrewCount: number;
  } {
    const edges = sobelEdges(frame);
    const results: ROIInspectionResult[] = [];
    let detectedScrewCount = 0;

    // Approximate pixel to mm conversion based on bracket scale
    // e.g. 800px width on a 80mm bracket = 10 px / mm
    const pxPerMm = (frame.width / 800) * 10.0;

    const detectedScrewPositions: Position2D[] = [];

    for (const roi of rois) {
      // 1. Compute transformed expected position in current frame pixels
      const transformedPx = alignmentEngine.transformMasterPoint(
        { x: roi.x, y: roi.y },
        frame.width,
        frame.height,
        alignment
      );

      // Search radius in pixels
      const expectedRadiusPx = roi.radius * Math.min(frame.width, frame.height);
      const toleranceRadiusPx = Math.max(
        tolerance.maxPositionOffsetPx,
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
        expectedRadiusPx
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
      tolerance
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
    expectedRadius: number
  ): { isPresent: boolean; center: Position2D | null; confidence: number } {
    const x0 = Math.max(expectedRadius, Math.floor(expX - searchRadius));
    const y0 = Math.max(expectedRadius, Math.floor(expY - searchRadius));
    const x1 = Math.min(frame.width - expectedRadius, Math.ceil(expX + searchRadius));
    const y1 = Math.min(frame.height - expectedRadius, Math.ceil(expY + searchRadius));

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
    tolerance: ToleranceConfig
  ): ExtraDetectedObject[] {
    const extra: ExtraDetectedObject[] = [];
    const minScrewDistancePx = tolerance.maxPositionOffsetPx * 1.8;

    // Center of transformed bracket area
    const cx = frame.width / 2 + alignment.translationX;
    const cy = frame.height / 2 + alignment.translationY;
    const searchSpanX = frame.width * 0.35;
    const searchSpanY = frame.height * 0.35;

    const x0 = Math.max(30, Math.floor(cx - searchSpanX));
    const y0 = Math.max(30, Math.floor(cy - searchSpanY));
    const x1 = Math.min(frame.width - 30, Math.ceil(cx + searchSpanX));
    const y1 = Math.min(frame.height - 30, Math.ceil(cy + searchSpanY));

    // Coarse scan step
    const step = 20;
    const rTest = 16;

    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        // Distance to all known valid screws
        let minDistToKnown = Infinity;
        for (const known of knownScrewCenters) {
          const d = Math.hypot(x - known.x, y - known.y);
          if (d < minDistToKnown) minDistToKnown = d;
        }

        // If far from all expected screws, check if a screw is present here
        if (minDistToKnown > minScrewDistancePx) {
          const check = this.detectScrewInRegion(frame, edges, x, y, 12, rTest);
          if (check.isPresent && check.confidence >= 0.78 && check.center) {
            // Found unexpected extra screw!
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

    return extra;
  }
}

export const roiInspector = new ROIInspector();
