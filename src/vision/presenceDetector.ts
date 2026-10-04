/**
 * Presence and Stabilization Detector
 * Evaluates workpiece entry, stabilization settlement, and removal.
 */

import { Box2D, ToleranceConfig } from '../types/master';
import { calculateMotionDelta, getRegionStats, GrayscaleImage } from './imageUtils';

export interface PresenceState {
  isPartPresent: boolean;
  presenceScore: number; // 0 - 100
  motionDelta: number; // Frame-to-frame movement
  isStabilized: boolean;
  stabilizationProgress: number; // 0.0 - 1.0 (500ms counter)
}

export class PresenceDetector {
  private baselineStats: { mean: number; variance: number } | null = null;
  private prevFrame: GrayscaleImage | null = null;
  private stabilizationStartTime: number | null = null;
  private isCurrentlyPresent: boolean = false;
  private hasInspectedCurrentPart: boolean = false;
  private postInspectionMotionFrames: number = 0;
  private postInspectionChangeFrames: number = 0;
  private inspectedPartStats: { mean: number; variance: number } | null = null;

  public setBaseline(stats: { mean: number; variance: number }) {
    this.baselineStats = stats;
  }

  public resetPartState() {
    this.isCurrentlyPresent = false;
    this.hasInspectedCurrentPart = false;
    this.postInspectionMotionFrames = 0;
    this.postInspectionChangeFrames = 0;
    this.inspectedPartStats = null;
    this.stabilizationStartTime = null;
    this.prevFrame = null;
  }

  public markPartInspected(
    inspectedFrame?: GrayscaleImage,
    detectionZone?: Box2D
  ) {
    this.hasInspectedCurrentPart = true;
    this.postInspectionMotionFrames = 0;
    this.postInspectionChangeFrames = 0;

    if (inspectedFrame && detectionZone) {
      const rx = detectionZone.x * inspectedFrame.width;
      const ry = detectionZone.y * inspectedFrame.height;
      const rw = detectionZone.width * inspectedFrame.width;
      const rh = detectionZone.height * inspectedFrame.height;
      this.inspectedPartStats = getRegionStats(inspectedFrame, rx, ry, rw, rh);
    } else {
      this.inspectedPartStats = null;
    }
  }

  /**
   * Detects intentional part repositioning after a judgement.
   *
   * This is deliberately separate from part-removal detection: an operator may
   * correct an NG/OK part without taking it completely out of the camera view.
   * A short burst of significant motion re-arms the same physical part so the
   * normal stabilization -> inspection cycle can run again.
   */
  public detectPostInspectionReposition(
    motionDelta: number,
    tolerance: ToleranceConfig
  ): boolean {
    if (!this.hasInspectedCurrentPart || !this.isCurrentlyPresent) return false;

    const baseMotionLimit = tolerance.stabilizationMotionThreshold || 8.0;
    const repositionThreshold = Math.max(10, baseMotionLimit * 1.35);

    if (motionDelta >= repositionThreshold) {
      this.postInspectionMotionFrames++;
    } else {
      this.postInspectionMotionFrames = Math.max(0, this.postInspectionMotionFrames - 1);
    }

    // Also allow a replacement part to re-arm when it was swapped while the
    // camera saw little frame-to-frame motion. This compares the current
    // detection-zone statistics with the frame that produced the last judgement.
    // It avoids keeping an old OK/NG latched simply because the operator changed
    // the part between two visually similar frames.
    // Require two consecutive high-motion frames to avoid a single noisy frame
    // instantly clearing a valid judgement. The frame-change path is updated
    // inside processFrame(), where the detection-zone bounds are available.
    return this.postInspectionMotionFrames >= 2 || this.postInspectionChangeFrames >= 2;
  }

  /**
   * Re-arm the current physical part without requiring removal.
   * The next frames must settle for the configured stabilization delay before
   * another judgement can be produced.
   */
  public rearmCurrentPart(now: number = Date.now()) {
    this.hasInspectedCurrentPart = false;
    this.postInspectionMotionFrames = 0;
    this.postInspectionChangeFrames = 0;
    this.inspectedPartStats = null;
    this.stabilizationStartTime = now;
  }

  public isAwaitingRemoval(): boolean {
    return this.hasInspectedCurrentPart;
  }

  /**
   * Process a new live camera frame through the detection zone
   */
  public processFrame(
    currentFrame: GrayscaleImage,
    detectionZone: Box2D,
    tolerance: ToleranceConfig,
    now: number = Date.now()
  ): PresenceState {
    const rx = detectionZone.x * currentFrame.width;
    const ry = detectionZone.y * currentFrame.height;
    const rw = detectionZone.width * currentFrame.width;
    const rh = detectionZone.height * currentFrame.height;

    // 1. Current region statistics
    const stats = getRegionStats(currentFrame, rx, ry, rw, rh);

    // 2. Motion delta from previous frame
    const motion = calculateMotionDelta(currentFrame, this.prevFrame, detectionZone);
    this.prevFrame = currentFrame;

    if (this.hasInspectedCurrentPart && this.inspectedPartStats) {
      const meanDiff = Math.abs(stats.mean - this.inspectedPartStats.mean);
      const stdDiff =
        Math.abs(Math.sqrt(stats.variance) - Math.sqrt(this.inspectedPartStats.variance));
      const replacementScore = meanDiff * 0.7 + stdDiff * 0.8;
      const replacementThreshold = Math.max(
        10,
        (tolerance.detectionZonePresenceThreshold || 18) * 0.55
      );

      if (replacementScore >= replacementThreshold) {
        this.postInspectionChangeFrames++;
      } else {
        this.postInspectionChangeFrames = Math.max(
          0,
          this.postInspectionChangeFrames - 1
        );
      }
    }

    // 3. Presence calculation
    // A workpiece on an inspection stand changes variance (edges/features) and mean brightness
    let diff = 0;
    if (this.baselineStats) {
      const meanDiff = Math.abs(stats.mean - this.baselineStats.mean);
      const varDiff = Math.abs(Math.sqrt(stats.variance) - Math.sqrt(this.baselineStats.variance));
      diff = meanDiff * 0.7 + varDiff * 0.8;
    } else {
      // If no empty baseline was saved, variance indicates structured object vs flat table
      diff = Math.sqrt(stats.variance);
    }

    const presenceThreshold = tolerance.detectionZonePresenceThreshold || 18.0;
    const removalThreshold = tolerance.partRemovalThreshold || 12.0;

    // Hysteresis for presence detection
    if (!this.isCurrentlyPresent) {
      if (diff > presenceThreshold) {
        this.isCurrentlyPresent = true;
        this.stabilizationStartTime = now;
      }
    } else {
      // Part is present. Check if it has been removed
      if (diff < removalThreshold) {
        this.isCurrentlyPresent = false;
        this.hasInspectedCurrentPart = false;
        this.stabilizationStartTime = null;
      }
    }

    // 4. Stabilization Logic
    const motionLimit = tolerance.stabilizationMotionThreshold || 8.0;
    const requiredDelay = tolerance.stabilizationDelayMs || 500;
    let isStabilized = false;
    let progress = 0;

    if (this.isCurrentlyPresent && !this.hasInspectedCurrentPart) {
      if (motion > motionLimit) {
        // Part or operator's hand is still moving significantly! Reset timer
        this.stabilizationStartTime = now;
        progress = 0;
      } else {
        if (!this.stabilizationStartTime) {
          this.stabilizationStartTime = now;
        }
        const elapsed = now - this.stabilizationStartTime;
        progress = Math.min(1.0, elapsed / requiredDelay);

        if (elapsed >= requiredDelay) {
          isStabilized = true;
        }
      }
    }

    return {
      isPartPresent: this.isCurrentlyPresent,
      presenceScore: Math.min(100, Math.round(diff * 2)),
      motionDelta: Math.round(motion * 10) / 10,
      isStabilized,
      stabilizationProgress: progress,
    };
  }
}
