/**
 * ROI Detection Engine
 * Inspects transformed Regions of Interest for screw presence, position tolerance, and extra objects.
 */

import { AlignmentResult, ExtraDetectedObject, ROIInspectionResult } from '../types/inspection';
import { InspectionROI, Position2D, ToleranceConfig } from '../types/master';
import { alignmentEngine } from './alignmentEngine';
import { GrayscaleImage, sobelEdges } from './imageUtils';
import { detectOpenCVCircles, OpenCVCircle } from './opencvEngine';
import { ReferenceImage } from '../types/master';

interface VisualSignature {
  brightness: number;
  centerBrightness: number;
  ringBrightness: number;
  centerContrast: number;
  edgeDensity: number;
  circularity: number;
  colorR: number;
  colorG: number;
  colorB: number;
  saturation: number;
  centerTexture: number;
}

interface VisualReferenceProfile {
  roiId: string;
  signature: VisualSignature;
}

const referenceProfileCache = new Map<string, Promise<VisualReferenceProfile | null>>();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function signatureSimilarity(a: VisualSignature, b: VisualSignature): number {
  const weights = {
    // Structure is more trustworthy than absolute appearance. Lighting,
    // exposure and paint fade can change brightness/color without changing
    // the identity of the screw.
    centerContrast: 0.24,
    edgeDensity: 0.27,
    circularity: 0.24,
    brightness: 0.04,
    centerBrightness: 0.03,
    ringBrightness: 0.03,
    colorR: 0.02,
    colorG: 0.02,
    colorB: 0.02,
    saturation: 0.06,
    centerTexture: 0.12,
  };

  const distance =
    Math.abs(a.centerContrast - b.centerContrast) * weights.centerContrast +
    Math.abs(a.edgeDensity - b.edgeDensity) * weights.edgeDensity +
    Math.abs(a.circularity - b.circularity) * weights.circularity +
    Math.abs(a.brightness - b.brightness) * weights.brightness +
    Math.abs(a.centerBrightness - b.centerBrightness) * weights.centerBrightness +
    Math.abs(a.ringBrightness - b.ringBrightness) * weights.ringBrightness +
    Math.abs(a.colorR - b.colorR) * weights.colorR +
    Math.abs(a.colorG - b.colorG) * weights.colorG +
    Math.abs(a.colorB - b.colorB) * weights.colorB +
    Math.abs(a.saturation - b.saturation) * weights.saturation +
    Math.abs(a.centerTexture - b.centerTexture) * weights.centerTexture;

  return clamp01(1 - distance);
}

function sampleSignature(
  gray: ImageData | GrayscaleImage,
  color: ImageData | null,
  cx: number,
  cy: number,
  radius: number,
  edgeImage?: GrayscaleImage
): VisualSignature {
  const width = gray.width;
  const height = gray.height;
  const grayData = 'data' in gray ? gray.data : new Uint8Array();
  const isImageData = gray instanceof ImageData;

  const readGray = (x: number, y: number) => {
    const ix = Math.max(0, Math.min(width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(height - 1, Math.round(y)));
    if (isImageData) {
      const i = (iy * width + ix) * 4;
      return (gray as ImageData).data[i] * 0.299 + (gray as ImageData).data[i + 1] * 0.587 + (gray as ImageData).data[i + 2] * 0.114;
    }
    return grayData[iy * width + ix] || 0;
  };

  const readColor = (x: number, y: number) => {
    if (!color) return { r: 128, g: 128, b: 128 };
    const ix = Math.max(0, Math.min(color.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(color.height - 1, Math.round(y)));
    const i = (iy * color.width + ix) * 4;
    return { r: color.data[i], g: color.data[i + 1], b: color.data[i + 2] };
  };

  const samples: Array<{ value: number; edge: number; ring: boolean; color: { r: number; g: number; b: number } }> = [];
  const angular = 24;
  const radial = 5;

  let centerSum = 0;
  let centerCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let circularVariance = 0;
  const ringValues: number[] = [];
  const allValues: number[] = [];
  let colorR = 0;
  let colorG = 0;
  let colorB = 0;
  let saturation = 0;
  let colorCount = 0;
  let centerTextureSum = 0;
  let centerTextureCount = 0;

  for (let rIndex = 0; rIndex < radial; rIndex++) {
    const radialFactor = 0.18 + (rIndex / (radial - 1)) * 1.02;
    const rr = Math.max(2, radius * radialFactor);
    for (let a = 0; a < angular; a++) {
      const angle = (a * Math.PI * 2) / angular;
      const x = cx + Math.cos(angle) * rr;
      const y = cy + Math.sin(angle) * rr;
      const value = readGray(x, y);
      const c = readColor(x, y);
      const edge = edgeImage
        ? edgeImage.data[Math.max(0, Math.min(edgeImage.height - 1, Math.round(y))) * edgeImage.width + Math.max(0, Math.min(edgeImage.width - 1, Math.round(x)))] / 255
        : 0;
      const ring = radialFactor >= 0.70 && radialFactor <= 1.20;
      samples.push({ value, edge, ring, color: c });
      allValues.push(value);
      if (ring) ringValues.push(value);
      if (radialFactor <= 0.45) {
        centerSum += value;
        centerCount++;
      }
      edgeSum += edge;
      edgeCount++;
      colorR += c.r / 255;
      colorG += c.g / 255;
      colorB += c.b / 255;
      const maxC = Math.max(c.r, c.g, c.b) / 255;
      const minC = Math.min(c.r, c.g, c.b) / 255;
      saturation += maxC > 0 ? (maxC - minC) / maxC : 0;
      colorCount++;
    }
  }

  const centerBrightness = centerCount ? centerSum / centerCount / 255 : 0;
  const ringBrightness = ringValues.length ? ringValues.reduce((s, v) => s + v, 0) / ringValues.length / 255 : centerBrightness;
  const brightness = allValues.length ? allValues.reduce((s, v) => s + v, 0) / allValues.length / 255 : 0;
  const centerContrast = clamp01(Math.abs(ringBrightness - centerBrightness) * 2.2);
  const edgeDensity = edgeCount ? edgeSum / edgeCount : 0;

  // Circularity is based on how consistently the ring differs from the center.
  // It is deliberately tolerant of missing/soft pixels so a slightly damaged
  // or faded screw can still match its reference.
  for (let a = 0; a < angular; a++) {
    const angle = (a * Math.PI * 2) / angular;
    const rr = Math.max(2, radius * 0.92);
    const outer = readGray(cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr) / 255;
    const inner = readGray(cx + Math.cos(angle) * radius * 0.35, cy + Math.sin(angle) * radius * 0.35) / 255;
    const delta = Math.abs(outer - inner);
    circularVariance += delta;
  }
  const circularity = clamp01((circularVariance / angular) * 2.0);

  // Screw heads normally contain local structure (slot/cross/recess/fastener
  // texture) near the center. A plain hole or a smooth reflection can share
  // the same outer circle but usually lacks this inner texture.
  for (let a = 0; a < angular; a++) {
    const angle = (a * Math.PI * 2) / angular;
    const nextAngle = ((a + 1) * Math.PI * 2) / angular;
    const r = Math.max(2, radius * 0.30);
    const current = readGray(
      cx + Math.cos(angle) * r,
      cy + Math.sin(angle) * r
    ) / 255;
    const next = readGray(
      cx + Math.cos(nextAngle) * r,
      cy + Math.sin(nextAngle) * r
    ) / 255;
    centerTextureSum += Math.abs(current - next);
    centerTextureCount++;
  }
  const centerTexture = centerTextureCount
    ? clamp01(centerTextureSum / centerTextureCount * 4.0)
    : 0;

  return {
    brightness,
    centerBrightness,
    ringBrightness,
    centerContrast,
    edgeDensity,
    circularity,
    colorR: colorCount ? colorR / colorCount : 0.5,
    colorG: colorCount ? colorG / colorCount : 0.5,
    colorB: colorCount ? colorB / colorCount : 0.5,
    saturation: colorCount ? saturation / colorCount : 0,
    centerTexture,
  };
}

async function loadVisualReference(reference: ReferenceImage): Promise<VisualReferenceProfile | null> {
  if (!reference.imageUrl) return null;
  const cacheKey = reference.id + ':' + reference.imageUrl.length;
  const cached = referenceProfileCache.get(cacheKey);
  if (cached) return cached;

  const promise = new Promise<VisualReferenceProfile | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        resolve({
          roiId: reference.roiId || reference.id,
          signature: sampleSignature(imageData, imageData, size / 2, size / 2, size * 0.30),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = reference.imageUrl;
  });

  referenceProfileCache.set(cacheKey, promise);
  return promise;
}

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
    masterHeight: number,
    referenceImages: ReferenceImage[] = [],
    colorFrame: ImageData | null = null
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

    const referenceProfiles = new Map<string, VisualReferenceProfile>();
    await Promise.all(referenceImages.map(async (reference) => {
      const profile = await loadVisualReference(reference);
      if (profile) referenceProfiles.set(profile.roiId, profile);
    }));

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

      // HARD ROI BOUNDARY: only the configured screw tolerance zone may
      // influence the screw decision. Do not expand the search outside the
      // engineer-defined zone because nearby brackets, edges, holes, or
      // background features must never become screw candidates.
      const searchRadius = toleranceRadiusPx;

      // 2. Scan localized search neighborhood for circular screw signature
      const detection = this.detectScrewInRegion(
        frame,
        edges,
        transformedPx.x,
        transformedPx.y,
        searchRadius,
        expectedRadiusPx,
        openCVCircles,
        referenceProfiles.get(roi.id)?.signature || null,
        colorFrame
      );

      // 3. Evaluate tolerance and confidence
      const minConfidence = roi.minConfidence || tolerance.minScrewConfidence || 0.65;
      const isPresent = detection.isPresent && detection.confidence >= minConfidence;
      const evidence: ROIInspectionResult['evidence'] = detection.evidence;

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
        status = evidence === 'UNCERTAIN' ? 'WARNING' : roi.isRequired ? 'FAIL' : 'WARNING';
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
        evidence,
        status,
        failureReason,
      });
    }

    // 4. Extra-object detection is reference-gated and bounded to the
    // aligned inspection envelope. We do NOT treat every circle as an extra
    // screw. A candidate must:
    //   1) come from OpenCV Hough,
    //   2) have a screw-like radius,
    //   3) be outside every expected ROI tolerance zone, and
    //   4) visually match at least one approved screw reference.
    //
    // This catches duplicate/extra screws while rejecting generic holes,
    // reflections and brackets much more safely than a geometry-only scan.
    const extraObjects = this.scanForReferenceMatchedExtras(
      frame,
      edges,
      rois,
      alignment,
      openCVCircles,
      referenceProfiles,
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
    openCVCircles: OpenCVCircle[] = [],
    referenceSignature: VisualSignature | null = null,
    colorFrame: ImageData | null = null
  ): { isPresent: boolean; center: Position2D | null; confidence: number; evidence: 'PRESENT' | 'ABSENT' | 'UNCERTAIN' } {
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
      const geometryConfidence = Math.min(
        0.99,
        cvCandidate.confidence * (0.70 + 0.30 * radiusFactor) * (0.70 + 0.30 * distanceFactor)
      );

      if (referenceSignature) {
        const candidateSignature = sampleSignature(
          frame,
          colorFrame,
          cvCandidate.center.x,
          cvCandidate.center.y,
          Math.max(4, cvCandidate.radius),
          edges
        );
        const visualSimilarity = signatureSimilarity(referenceSignature, candidateSignature);
        // A reference image is evidence, not a pixel template. The candidate
        // survives only when its visual characteristics are reasonably similar.
        const confidence = Math.min(0.99, geometryConfidence * 0.45 + visualSimilarity * 0.55);
        // A permissive similarity threshold makes circular holes, reflections,
        // and washers dangerous false positives. Keep the reference tolerant,
        // but require enough structural agreement before declaring PRESENT.
        const centerTextureDelta = Math.abs(
          candidateSignature.centerTexture - referenceSignature.centerTexture
        );
        if (
          visualSimilarity >= 0.60 &&
          centerTextureDelta <= 0.35 &&
          confidence >= 0.62
        ) {
          return { isPresent: true, center: cvCandidate.center, confidence, evidence: 'PRESENT' };
        }
      } else if (geometryConfidence >= 0.55) {
        return { isPresent: true, center: cvCandidate.center, confidence: geometryConfidence, evidence: 'PRESENT' };
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

        const geometryScore = avgEdge * 0.7 + contrast * 0.5;
        let totalScore = geometryScore * distFactor;

        if (referenceSignature) {
          const candidateSignature = sampleSignature(
            frame,
            colorFrame,
            cx,
            cy,
            testR,
            edges
          );
          const visualSimilarity = signatureSimilarity(referenceSignature, candidateSignature);
          // Visual evidence carries slightly more weight than raw circularity.
          // This is what prevents a nearby hole/reflection from being accepted
          // merely because it happens to look circular.
          totalScore *= 0.45 + visualSimilarity * 0.90;
        }

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

    // Geometry alone is only a candidate. The final PRESENT decision below
    // must also survive the visual-reference gate when a golden reference is
    // configured. This prevents a strong circular edge from becoming a screw
    // merely because it is geometrically convincing.
    let isPresent = confidence >= 0.55 && bestCenter !== null;

    if (isPresent && referenceSignature && bestCenter) {
      const visualSimilarity = signatureSimilarity(
        referenceSignature,
        sampleSignature(frame, colorFrame, bestCenter.x, bestCenter.y, testR, edges)
      );
      // Do not call a circle a screw when its visual signature is too far from
      // the golden reference. The threshold is intentionally tolerant of
      // lighting, paint fade, and minor deformation, but must reject weak
      // look-alikes such as holes and reflections.
      const centerTextureDelta = Math.abs(
        sampleSignature(
          frame,
          colorFrame,
          bestCenter.x,
          bestCenter.y,
          testR,
          edges
        ).centerTexture - referenceSignature.centerTexture
      );
      isPresent =
        visualSimilarity >= 0.60 && centerTextureDelta <= 0.35;
      confidence = Math.min(
        0.99,
        confidence * (0.45 + visualSimilarity * 0.55)
      );
    }

    // Evidence must distinguish "good-quality view with no screw" from
    // "camera evidence is too weak to know". Low candidate confidence alone
    // is NOT proof of absence because blur, glare, darkness, or occlusion can
    // suppress the detector.
    //
    // Build a lightweight ROI image-quality signal from edge activity and
    // local intensity variation. If the ROI itself is visually unreliable,
    // the result is UNCERTAIN and RuleEngine will contain it as INVALID.
    let qualityEdge = 0;
    let qualityVariance = 0;
    let qualitySamples = 0;
    const qualityStep = Math.max(2, Math.round(testR / 4));
    for (let qy = Math.max(0, Math.floor(expY - searchRadius)); qy <= Math.min(frame.height - 1, Math.ceil(expY + searchRadius)); qy += qualityStep) {
      for (let qx = Math.max(0, Math.floor(expX - searchRadius)); qx <= Math.min(frame.width - 1, Math.ceil(expX + searchRadius)); qx += qualityStep) {
        const idx = qy * frame.width + qx;
        qualityEdge += edges.data[idx] / 255;
        qualityVariance += Math.abs(frame.data[idx] - frame.data[Math.max(0, Math.min(frame.data.length - 1, idx + Math.min(frame.width, qualityStep)))]) / 255;
        qualitySamples++;
      }
    }
    const sceneQuality = qualitySamples
      ? clamp01((qualityEdge / qualitySamples) * 1.4 + (qualityVariance / qualitySamples) * 0.8)
      : 0;

    const uncertaintyFloor = 0.35;
    const evidence = isPresent
      ? 'PRESENT'
      : sceneQuality < 0.22
        ? 'UNCERTAIN'
        : confidence >= uncertaintyFloor
          ? 'UNCERTAIN'
          : 'ABSENT';

    return {
      isPresent,
      center: isPresent ? bestCenter : null,
      confidence,
      evidence,
    };
  }

  /**
   * Detect extra screws only from reference-matched OpenCV candidates inside
   * the aligned workpiece envelope. Geometry alone is never enough here.
   */
  private scanForReferenceMatchedExtras(
    frame: GrayscaleImage,
    edges: GrayscaleImage,
    rois: InspectionROI[],
    alignment: AlignmentResult,
    openCVCircles: OpenCVCircle[],
    referenceProfiles: Map<string, VisualReferenceProfile>,
    tolerance: ToleranceConfig,
    masterWidth: number,
    masterHeight: number,
    configuredMaxOffsetPx: number
  ): ExtraDetectedObject[] {
    if (openCVCircles.length === 0 || referenceProfiles.size === 0 || rois.length === 0) {
      return [];
    }

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

    const xs = transformed.map((p) => p.x);
    const ys = transformed.map((p) => p.y);
    const marginX = Math.max(configuredMaxOffsetPx * 2, frame.width * 0.05);
    const marginY = Math.max(configuredMaxOffsetPx * 2, frame.height * 0.05);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - marginX));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - marginY));
    const x1 = Math.min(frame.width - 1, Math.ceil(Math.max(...xs) + marginX));
    const y1 = Math.min(frame.height - 1, Math.ceil(Math.max(...ys) + marginY));

    const expectedCenters = rois.map((roi) => ({
      center: alignmentEngine.transformMasterPoint(
        { x: roi.x, y: roi.y },
        frame.width,
        frame.height,
        alignment,
        masterWidth,
        masterHeight
      ),
      radius: roi.radius * Math.min(frame.width, frame.height),
      toleranceRadius: Math.max(
        configuredMaxOffsetPx,
        roi.toleranceRadius * Math.min(frame.width, frame.height)
      ),
    }));

    const references = Array.from(referenceProfiles.values()).map((profile) => profile.signature);
    const minReferenceSimilarity = 0.60;
    const minExtraConfidence = 0.62;
    const dedupeDistance = Math.max(10, configuredMaxOffsetPx * 0.75);
    const extra: ExtraDetectedObject[] = [];

    for (const circle of openCVCircles) {
      if (
        circle.center.x < x0 ||
        circle.center.x > x1 ||
        circle.center.y < y0 ||
        circle.center.y > y1
      ) {
        continue;
      }

      const matchingExpected = expectedCenters.some((expected) => {
        const distance = Math.hypot(
          circle.center.x - expected.center.x,
          circle.center.y - expected.center.y
        );
        const radiusCompatible =
          circle.radius >= expected.radius * 0.55 &&
          circle.radius <= expected.radius * 1.65;
        return radiusCompatible && distance <= expected.toleranceRadius;
      });

      // A candidate inside an expected ROI belongs to that ROI's normal
      // classification path. Only candidates outside all expected zones can
      // become an EXTRA_OBJECT_DETECTED defect.
      if (matchingExpected) continue;

      const radiusReference = expectedCenters
        .map((expected) => expected.radius)
        .reduce((best, radius) =>
          Math.abs(radius - circle.radius) < Math.abs(best - circle.radius) ? radius : best
        );

      if (
        circle.radius < radiusReference * 0.55 ||
        circle.radius > radiusReference * 1.65
      ) {
        continue;
      }

      const candidateSignature = sampleSignature(
        frame,
        null,
        circle.center.x,
        circle.center.y,
        Math.max(4, circle.radius),
        edges
      );

      let bestSimilarity = 0;
      for (const referenceSignature of references) {
        bestSimilarity = Math.max(
          bestSimilarity,
          signatureSimilarity(referenceSignature, candidateSignature)
        );
      }

      if (bestSimilarity < minReferenceSimilarity) continue;

      const distanceToNearestExpected = Math.min(
        ...expectedCenters.map((expected) =>
          Math.hypot(
            circle.center.x - expected.center.x,
            circle.center.y - expected.center.y
          )
        )
      );

      const distanceFactor = Math.max(
        0,
        1 - distanceToNearestExpected / Math.max(frame.width, frame.height)
      );
      const radiusFactor = Math.max(
        0,
        1 -
          Math.abs(circle.radius - radiusReference) /
            Math.max(radiusReference, 1)
      );
      const confidence = Math.min(
        0.99,
        circle.confidence *
          (0.55 + 0.25 * radiusFactor + 0.20 * bestSimilarity) *
          (0.85 + 0.15 * (1 - distanceFactor))
      );

      if (confidence < minExtraConfidence) continue;

      const duplicate = extra.some((item) => {
        const px = item.position.x * frame.width;
        const py = item.position.y * frame.height;
        return Math.hypot(px - circle.center.x, py - circle.center.y) < dedupeDistance;
      });
      if (duplicate) continue;

      extra.push({
        id: `extra-screw-${extra.length + 1}`,
        position: {
          x: circle.center.x / frame.width,
          y: circle.center.y / frame.height,
        },
        confidence: Math.round(confidence * 100) / 100,
        distanceToNearestExpected: Math.round(distanceToNearestExpected),
      });
    }

    return extra;
  }

}

export const roiInspector = new ROIInspector();
