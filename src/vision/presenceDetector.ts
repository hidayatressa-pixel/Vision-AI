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

  public setBaseline(stats: { mean: number; variance: number }) {
    this.baselineStats = stats;
  }

  public resetPartState() {
    this.isCurrentlyPresent = false;
    this.hasInspectedCurrentPart = false;
    this.postInspectionMotionFrames = 0;
    this.stabilizationStartTime = null;
    this.prevFrame = null;
  }

  public markPartInspected() {
    this.hasInspectedCurrentPart = true;
    this.postInspectionMotionFrames = 0;
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

    // Require two consecutive high-motion frames to avoid a single noisy frame
    // instantly clearing a valid judgement.
    return this.postInspectionMotionFrames >= 2;
  }

  /**
   * Re-arm the current physical part without requiring removal.
   * The next frames must settle for the configured stabilization delay before
   * another judgement can be produced.
   */
  public rearmCurrentPart(now: number = Date.now()) {
    this.hasInspectedCurrentPart = false;
    this.postInspectionMotionFrames = 0;
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
