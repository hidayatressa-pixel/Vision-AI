/**
 * Alignment Engine
 * Reference-based alignment compensating for camera/product translation, rotation, and scale.
 */

import { AlignmentResult } from '../types/inspection';
import { Position2D, ReferenceAnchor, ToleranceConfig } from '../types/master';
import { GrayscaleImage, sobelEdges } from './imageUtils';

export class AlignmentEngine {
  /**
   * Find reference anchors in the frame and calculate rigid transformation
   */
  public calculateAlignment(
    frame: GrayscaleImage,
    masterWidth: number,
    masterHeight: number,
    anchors: ReferenceAnchor[],
    tolerance: ToleranceConfig
  ): AlignmentResult {
    const startTime = performance.now();
    const edges = sobelEdges(frame);
    const matchedAnchors: Array<{
      id: string;
      expected: Position2D;
      found: Position2D;
      confidence: number;
    }> = [];

    // Scale factor between master resolution and current frame resolution
    const scaleX = frame.width / masterWidth;
    const scaleY = frame.height / masterHeight;

    for (const anchor of anchors) {
      // Expected anchor position in current frame pixels
      const expPx = anchor.x * frame.width;
      const expPy = anchor.y * frame.height;

      // Search box size based on searchRadius
      const searchBoxSize = Math.max(30, anchor.searchRadius * Math.min(frame.width, frame.height));
      const x0 = Math.max(0, Math.floor(expPx - searchBoxSize));
      const y0 = Math.max(0, Math.floor(expPy - searchBoxSize));
      const x1 = Math.min(frame.width - 1, Math.ceil(expPx + searchBoxSize));
      const y1 = Math.min(frame.height - 1, Math.ceil(expPy + searchBoxSize));

      // Locate fiducial feature (e.g. crosshair or high-symmetry corner)
      const found = this.locateAnchorFeature(frame, edges, expPx, expPy, x0, y0, x1, y1);

      if (found.confidence >= 0.35) {
        matchedAnchors.push({
          id: anchor.id,
          expected: { x: expPx, y: expPy },
          found: { x: found.x, y: found.y },
          confidence: found.confidence,
        });
      }
    }

    // Minimum required anchors is 2 for rigid transformation (translation + rotation + scale)
    if (matchedAnchors.length < 2) {
      return {
        success: false,
        translationX: 0,
        translationY: 0,
        rotationDeg: 0,
        scale: 1.0,
        confidence: matchedAnchors.length > 0 ? matchedAnchors[0].confidence : 0,
        matchedAnchorCount: matchedAnchors.length,
        totalAnchorCount: anchors.length,
        anchorPositions: matchedAnchors,
        errorMessage: `Reference anchors not detected (${matchedAnchors.length}/${anchors.length} found)`,
      };
    }

    // Solve 2D Rigid / Similarity Transformation (Procrustes)
    // Source: expected positions, Target: found positions
    const N = matchedAnchors.length;
    let sumSrcX = 0,
      sumSrcY = 0,
      sumTgtX = 0,
      sumTgtY = 0;

    for (const m of matchedAnchors) {
      sumSrcX += m.expected.x;
      sumSrcY += m.expected.y;
      sumTgtX += m.found.x;
      sumTgtY += m.found.y;
    }

    const meanSrcX = sumSrcX / N;
    const meanSrcY = sumSrcY / N;
    const meanTgtX = sumTgtX / N;
    const meanTgtY = sumTgtY / N;

    let num = 0;
    let den = 0;
    let srcVar = 0;

    for (const m of matchedAnchors) {
      const uX = m.expected.x - meanSrcX;
      const uY = m.expected.y - meanSrcY;
      const vX = m.found.x - meanTgtX;
      const vY = m.found.y - meanTgtY;

      num += uX * vY - uY * vX;
      den += uX * vX + uY * vY;
      srcVar += uX * uX + uY * uY;
    }

    // Rotation angle
    const angleRad = Math.atan2(num, den);
    const rotationDeg = (angleRad * 180) / Math.PI;

    // Scale
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const norm = Math.sqrt(den * den + num * num);
    const scale = srcVar > 0 ? norm / srcVar : 1.0;

    // Translation: T = Target_center - R(Scale * Source_center)
    const rotScaledSrcX = scale * (cosA * meanSrcX - sinA * meanSrcY);
    const rotScaledSrcY = scale * (sinA * meanSrcX + cosA * meanSrcY);

    const translationX = meanTgtX - rotScaledSrcX;
    const translationY = meanTgtY - rotScaledSrcY;

    // Average anchor confidence
    const meanConf = matchedAnchors.reduce((acc, a) => acc + a.confidence, 0) / matchedAnchors.length;

    // Check tolerances
    const maxRot = tolerance.maxRotationToleranceDeg || 15.0;
    const minConf = tolerance.minAlignmentConfidence || 0.55;

    const isSuccess = Math.abs(rotationDeg) <= maxRot && meanConf >= minConf;

    return {
      success: isSuccess,
      translationX: Math.round(translationX * 100) / 100,
      translationY: Math.round(translationY * 100) / 100,
      rotationDeg: Math.round(rotationDeg * 100) / 100,
      scale: Math.round(scale * 1000) / 1000,
      confidence: Math.round(meanConf * 100) / 100,
      matchedAnchorCount: matchedAnchors.length,
      totalAnchorCount: anchors.length,
      anchorPositions: matchedAnchors,
      errorMessage: !isSuccess
        ? Math.abs(rotationDeg) > maxRot
          ? `Product rotation (${rotationDeg.toFixed(1)}°) exceeds tolerance (±${maxRot}°)`
          : `Alignment confidence (${(meanConf * 100).toFixed(0)}%) below threshold (${(minConf * 100).toFixed(0)}%)`
        : undefined,
    };
  }

  /**
   * Helper to locate crosshair / corner fiducial inside search window
   */
  private locateAnchorFeature(
    frame: GrayscaleImage,
    edges: GrayscaleImage,
    expX: number,
    expY: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): { x: number; y: number; confidence: number } {
    let bestX = expX;
    let bestY = expY;
    let maxScore = -1;

    const step = 2;
    const patchRadius = 10;

    for (let y = y0 + patchRadius; y <= y1 - patchRadius; y += step) {
      const row = y * frame.width;
      for (let x = x0 + patchRadius; x <= x1 - patchRadius; x += step) {
        // Evaluate fiducial cross symmetry (horizontal and vertical gradient balance)
        let hGrad = 0;
        let vGrad = 0;

        for (let d = -patchRadius; d <= patchRadius; d++) {
          vGrad += edges.data[(y + d) * frame.width + x];
          hGrad += edges.data[row + x + d];
        }

        // Crosshairs have strong gradients both horizontally and vertically
        const crossStrength = Math.min(hGrad, vGrad) * 2 / (hGrad + vGrad + 1e-4);
        const distFromCenter = Math.hypot(x - expX, y - expY);
        const distancePenalty = Math.max(0, 1 - distFromCenter / (x1 - x0 + 1));

        const score = (hGrad + vGrad) * crossStrength * distancePenalty;

        if (score > maxScore) {
          maxScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    // Normalizing confidence score
    const confidence = maxScore > 200 ? Math.min(0.98, 0.4 + maxScore / 2500) : 0.3;

    return { x: bestX, y: bestY, confidence };
  }

  /**
   * Transforms a normalized master point (0-1) into current camera frame pixels
   */
  public transformMasterPoint(
    masterPoint: Position2D,
    frameWidth: number,
    frameHeight: number,
    alignment: AlignmentResult
  ): Position2D {
    // Unaligned baseline position in current frame
    const basePx = masterPoint.x * frameWidth;
    const basePy = masterPoint.y * frameHeight;

    if (!alignment.success) {
      return { x: basePx, y: basePy };
    }

    const rad = (alignment.rotationDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    // Center of master frame
    const cx = frameWidth / 2;
    const cy = frameHeight / 2;

    const dx = basePx - cx;
    const dy = basePy - cy;

    // Apply scale and rotation around center, then translation
    const rotX = alignment.scale * (dx * cosA - dy * sinA);
    const rotY = alignment.scale * (dx * sinA + dy * cosA);

    return {
      x: cx + rotX + alignment.translationX,
      y: cy + rotY + alignment.translationY,
    };
  }
}

export const alignmentEngine = new AlignmentEngine();
