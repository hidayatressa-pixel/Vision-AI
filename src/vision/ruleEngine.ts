/**
 * Deterministic Inspection Rule Engine
 * Evaluates counts, presence, tolerances, extra objects, and alignment.
 * Distinguishes Product NG from System/Inspection Error.
 */

import {
  AlignmentResult,
  DefectItem,
  ExtraDetectedObject,
  JudgementResult,
  ROIInspectionResult,
} from '../types/inspection';
import { MasterRevision } from '../types/master';

export interface RuleEvaluationResult {
  judgement: JudgementResult;
  primaryReason: string;
  defects: DefectItem[];
  expectedCount: number;
  detectedCount: number;
}

export class RuleEngine {
  /**
   * Deterministic evaluation of all inspection criteria
   */
  public evaluate(
    revision: MasterRevision,
    alignment: AlignmentResult,
    roiResults: ROIInspectionResult[],
    extraObjects: ExtraDetectedObject[]
  ): RuleEvaluationResult {
    const defects: DefectItem[] = [];

    // 1. Alignment is part of the product inspection path. If the configured
    // reference cannot be located, fail safe as Product NG rather than exposing
    // a user-facing SYSTEM ERROR. Genuine infrastructure failures are handled
    // separately by the pipeline/PLC watchdog.
    if (!alignment.success) {
      defects.push({
        code: 'ALIGNMENT_FAILED',
        message: alignment.errorMessage || 'Alignment Failed — Reference fiducials not found or confidence too low',
        expected: `${revision.anchors.length} anchors`,
        actual: `${alignment.matchedAnchorCount} anchors`,
      });

      return {
        judgement: 'NG',
        primaryReason: alignment.errorMessage || 'Alignment Failed: Reference fiducials not found',
        defects,
        expectedCount: revision.expectedObjectCount,
        detectedCount: 0,
      };
    }

    // 2. Per-ROI Evaluation (Missing screws, out-of-tolerance screws, low confidence)
    let presentScrewCount = 0;

    for (const roi of roiResults) {
      if (!roi.isPresent) {
        if (roi.status === 'FAIL') {
          defects.push({
            code: 'MISSING_PART',
            roiId: roi.roiId,
            roiName: roi.roiName,
            message: `${roi.roiName} Missing`,
            expected: 'Present (Conf > 65%)',
            actual: `Absent (Conf ${(roi.confidence * 100).toFixed(0)}%)`,
          });
        }
      } else {
        // Present, now check tolerance
        if (!roi.isWithinTolerance) {
          defects.push({
            code: 'POSITION_OUT_OF_TOLERANCE',
            roiId: roi.roiId,
            roiName: roi.roiName,
            message: `${roi.roiName} Position Out of Tolerance (+${roi.positionOffsetMm}mm)`,
            expected: `< ${revision.tolerance.maxPositionOffsetMm}mm`,
            actual: `${roi.positionOffsetMm}mm (${roi.positionOffsetPx}px)`,
          });
        } else {
          presentScrewCount++;
        }
      }
    }

    // 3. Extra Detected Objects Check
    if (extraObjects.length > 0) {
      for (const extra of extraObjects) {
        defects.push({
          code: 'EXTRA_OBJECT_DETECTED',
          message: `Extra Object/Screw Detected (Confidence ${(extra.confidence * 100).toFixed(0)}%)`,
          expected: 'No extra objects',
          actual: `Detected at (${(extra.position.x * 100).toFixed(1)}%, ${(extra.position.y * 100).toFixed(1)}%)`,
        });
      }
    }

    // 4. Object Count Rule
    const expectedCount = revision.expectedObjectCount;
    const totalDetected = presentScrewCount + extraObjects.length;

    if (totalDetected !== expectedCount) {
      if (totalDetected < expectedCount && !defects.some((d) => d.code === 'MISSING_PART')) {
        defects.push({
          code: 'INCORRECT_COUNT',
          message: `Screw Count Mismatch: Expected ${expectedCount}, Detected ${totalDetected}`,
          expected: expectedCount,
          actual: totalDetected,
        });
      } else if (totalDetected > expectedCount && !defects.some((d) => d.code === 'EXTRA_OBJECT_DETECTED')) {
        defects.push({
          code: 'EXTRA_OBJECT_DETECTED',
          message: `Extra Screw Detected: Expected ${expectedCount}, Found ${totalDetected}`,
          expected: expectedCount,
          actual: totalDetected,
        });
      }
    }

    // 5. Final Judgement
    if (defects.length === 0) {
      return {
        judgement: 'OK',
        primaryReason: `All ${expectedCount}/${expectedCount} Screws Inspected OK (Tolerance Passed)`,
        defects: [],
        expectedCount,
        detectedCount: presentScrewCount,
      };
    }

    // There are defects -> NG
    // Primary reason is the first/most critical defect
    const primaryDefect = defects[0];

    return {
      judgement: 'NG',
      primaryReason: primaryDefect.message,
      defects,
      expectedCount,
      detectedCount: presentScrewCount,
    };
  }
}

export const ruleEngine = new RuleEngine();
