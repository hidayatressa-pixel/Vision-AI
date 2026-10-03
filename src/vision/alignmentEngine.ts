/**
 * Alignment Engine
 *
 * Calculates a similarity transform:
 *   Target = Scale * Rotation * Source + Translation
 *
 * Coordinates used by the alignment system are absolute frame pixels.
 */

import { AlignmentResult } from '../types/inspection';
import { Position2D, ReferenceAnchor, ToleranceConfig } from '../types/master';
import { GrayscaleImage, sobelEdges } from './imageUtils';

export class AlignmentEngine {
  public calculateAlignment(
    frame: GrayscaleImage,
    masterWidth: number,
    masterHeight: number,
    anchors: ReferenceAnchor[],
    tolerance: ToleranceConfig
  ): AlignmentResult {
    const startTime = performance.now();

    if (frame.width <= 0 || frame.height <= 0) {
      return {
        success: false, translationX: 0, translationY: 0, rotationDeg: 0,
        scale: 1, confidence: 0, matchedAnchorCount: 0,
        totalAnchorCount: anchors.length, anchorPositions: [],
        errorMessage: 'Invalid camera frame dimensions',
      };
    }

    if (anchors.length < 2) {
      return {
        success: false, translationX: 0, translationY: 0, rotationDeg: 0,
        scale: 1, confidence: 0, matchedAnchorCount: 0,
        totalAnchorCount: anchors.length, anchorPositions: [],
        errorMessage: `At least 2 reference anchors are required (${anchors.length} configured)`,
      };
    }

    if (masterWidth <= 0 || masterHeight <= 0) {
      return {
        success: false, translationX: 0, translationY: 0, rotationDeg: 0,
        scale: 1, confidence: 0, matchedAnchorCount: 0,
        totalAnchorCount: anchors.length, anchorPositions: [],
        errorMessage: 'Invalid master dimensions',
      };
    }

    const edges = sobelEdges(frame);

    const matchedAnchors: Array<{
      id: string;
      expected: Position2D;
      found: Position2D;
      confidence: number;
    }> = [];

    for (const anchor of anchors) {
      const expPx = anchor.x * frame.width;
      const expPy = anchor.y * frame.height;

      const radius = Math.max(
        15,
        anchor.searchRadius * Math.min(frame.width, frame.height)
      );

      const x0 = Math.max(0, Math.floor(expPx - radius));
      const y0 = Math.max(0, Math.floor(expPy - radius));
      const x1 = Math.min(frame.width - 1, Math.ceil(expPx + radius));
      const y1 = Math.min(frame.height - 1, Math.ceil(expPy + radius));

      const found = this.locateAnchorFeature(
        frame, edges, expPx, expPy, x0, y0, x1, y1, anchor.patchRadius
      );

      if (found.confidence >= 0.35) {
        matchedAnchors.push({
          id: anchor.id,
          expected: { x: expPx, y: expPy },
          found: { x: found.x, y: found.y },
          confidence: found.confidence,
        });
      }
    }

    if (matchedAnchors.length < 2) {
      return {
        success: false, translationX: 0, translationY: 0, rotationDeg: 0,
        scale: 1,
        confidence: matchedAnchors.length > 0 ? matchedAnchors[0].confidence : 0,
        matchedAnchorCount: matchedAnchors.length,
        totalAnchorCount: anchors.length,
        anchorPositions: matchedAnchors,
        errorMessage: `Reference anchors not detected (${matchedAnchors.length}/${anchors.length} found)`,
      };
    }

    const N = matchedAnchors.length;
    let sumSrcX = 0, sumSrcY = 0, sumDstX = 0, sumDstY = 0;

    for (const match of matchedAnchors) {
      sumSrcX += match.expected.x;
      sumSrcY += match.expected.y;
      sumDstX += match.found.x;
      sumDstY += match.found.y;
    }

    const meanSrcX = sumSrcX / N;
    const meanSrcY = sumSrcY / N;
    const meanDstX = sumDstX / N;
    const meanDstY = sumDstY / N;

    let num = 0;
    let den = 0;
    let sourceVariance = 0;

    for (const match of matchedAnchors) {
      const sx = match.expected.x - meanSrcX;
      const sy = match.expected.y - meanSrcY;
      const dx = match.found.x - meanDstX;
      const dy = match.found.y - meanDstY;

      num += sx * dy - sy * dx;
      den += sx * dx + sy * dy;
      sourceVariance += sx * sx + sy * sy;
    }

    if (sourceVariance <= 1e-6) {
      return {
        success: false, translationX: 0, translationY: 0, rotationDeg: 0,
        scale: 1, confidence: 0,
        matchedAnchorCount: matchedAnchors.length,
        totalAnchorCount: anchors.length,
        anchorPositions: matchedAnchors,
        errorMessage: 'Reference anchors are geometrically degenerate',
      };
    }

    const angleRad = Math.atan2(num, den);
    const rotationDeg = (angleRad * 180) / Math.PI;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const correlationMagnitude = Math.sqrt(den * den + num * num);
    const scale = correlationMagnitude / sourceVariance;

    const transformedMeanX =
      scale * (cosA * meanSrcX - sinA * meanSrcY);
    const transformedMeanY =
      scale * (sinA * meanSrcX + cosA * meanSrcY);

    const translationX = meanDstX - transformedMeanX;
    const translationY = meanDstY - transformedMeanY;

    let squaredResidual = 0;

    for (const match of matchedAnchors) {
      const predictedX =
        scale * (cosA * match.expected.x - sinA * match.expected.y) +
        translationX;
      const predictedY =
        scale * (sinA * match.expected.x + cosA * match.expected.y) +
        translationY;

      const residual = Math.hypot(
        predictedX - match.found.x,
        predictedY - match.found.y
      );

      squaredResidual += residual * residual;
    }

    const rmsResidual = Math.sqrt(
      squaredResidual / matchedAnchors.length
    );

    const meanConfidence =
      matchedAnchors.reduce((sum, anchor) => sum + anchor.confidence, 0) /
      matchedAnchors.length;

    const maxRotation = tolerance.maxRotationToleranceDeg || 15;
    const minConfidence = tolerance.minAlignmentConfidence || 0.55;

    const minScale = tolerance.minScale ?? 0.80;
    const maxScale = tolerance.maxScale ?? 1.20;
    const maxResidualPx = tolerance.maxAlignmentResidualPx ?? Math.max(tolerance.maxPositionOffsetPx * 2, 10);

    const rotationOk = Math.abs(rotationDeg) <= maxRotation;
    const confidenceOk = meanConfidence >= minConfidence;
    const scaleOk = scale >= minScale && scale <= maxScale;
    const residualOk = rmsResidual <= maxResidualPx;
    const success = rotationOk && confidenceOk && scaleOk && residualOk;

    let errorMessage: string | undefined;

    if (!rotationOk) {
      errorMessage =
        `Product rotation (${rotationDeg.toFixed(1)}°) exceeds tolerance (±${maxRotation}°)`;
    } else if (!scaleOk) {
      errorMessage =
        `Alignment scale (${scale.toFixed(3)}) is outside allowed range (${minScale.toFixed(2)} - ${maxScale.toFixed(2)})`;
    } else if (!confidenceOk) {
      errorMessage =
        `Alignment confidence (${(meanConfidence * 100).toFixed(0)}%) below threshold (${(minConfidence * 100).toFixed(0)}%)`;
    } else if (!residualOk) {
      errorMessage =
        `Anchor residual error (${rmsResidual.toFixed(1)}px) exceeds limit (${maxResidualPx.toFixed(1)}px)`;
    }

    void (performance.now() - startTime);

    return {
      success,
      translationX: Math.round(translationX * 100) / 100,
      translationY: Math.round(translationY * 100) / 100,
      rotationDeg: Math.round(rotationDeg * 100) / 100,
      scale: Math.round(scale * 1000) / 1000,
      confidence: Math.round(meanConfidence * 100) / 100,
      matchedAnchorCount: matchedAnchors.length,
      totalAnchorCount: anchors.length,
      anchorPositions: matchedAnchors,
      errorMessage,
    };
  }

  private locateAnchorFeature(
    frame: GrayscaleImage,
    edges: GrayscaleImage,
    expX: number,
    expY: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    configuredPatchRadius?: number
  ): { x: number; y: number; confidence: number } {
    let bestX = expX;
    let bestY = expY;
    let maxScore = -1;

    const step = 2;
    const patchRadius = Math.max(
      4,
      Math.min(20, Math.round(configuredPatchRadius || 10))
    );

    const safeX0 = Math.max(x0, patchRadius);
    const safeY0 = Math.max(y0, patchRadius);
    const safeX1 = Math.min(x1, frame.width - patchRadius - 1);
    const safeY1 = Math.min(y1, frame.height - patchRadius - 1);

    for (let y = safeY0; y <= safeY1; y += step) {
      const row = y * frame.width;

      for (let x = safeX0; x <= safeX1; x += step) {
        let horizontalGradient = 0;
        let verticalGradient = 0;

        for (let d = -patchRadius; d <= patchRadius; d++) {
          verticalGradient += edges.data[(y + d) * frame.width + x];
          horizontalGradient += edges.data[row + x + d];
        }

        const totalGradient = horizontalGradient + verticalGradient;
        if (totalGradient <= 0) continue;

        const crossStrength =
          (Math.min(horizontalGradient, verticalGradient) * 2) /
          (totalGradient + 1e-4);

        const distanceFromExpected = Math.hypot(x - expX, y - expY);
        const searchWidth = Math.max(1, x1 - x0);
        const distancePenalty = Math.max(
          0,
          1 - distanceFromExpected / (searchWidth + 1)
        );

        const score = totalGradient * crossStrength * distancePenalty;

        if (score > maxScore) {
          maxScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    const confidence =
      maxScore > 200
        ? Math.min(0.98, 0.4 + maxScore / 2500)
        : 0.3;

    return { x: bestX, y: bestY, confidence };
  }

  public transformMasterPoint(
    masterPoint: Position2D,
    frameWidth: number,
    frameHeight: number,
    alignment: AlignmentResult
  ): Position2D {
    const sourceX = masterPoint.x * frameWidth;
    const sourceY = masterPoint.y * frameHeight;

    if (!alignment.success) {
      return { x: sourceX, y: sourceY };
    }

    const rad = (alignment.rotationDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const transformedX =
      alignment.scale * (cosA * sourceX - sinA * sourceY) +
      alignment.translationX;

    const transformedY =
      alignment.scale * (sinA * sourceX + cosA * sourceY) +
      alignment.translationY;

    return { x: transformedX, y: transformedY };
  }
}

export const alignmentEngine = new AlignmentEngine();
