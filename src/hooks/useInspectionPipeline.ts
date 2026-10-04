/**
 * Realtime Vision Inspection Pipeline Hook
 * Implements the zero-touch automated state machine integrated with PLC Interlock:
 * WAITING -> PART_DETECTED -> STABILIZING (500ms) -> CAPTURE -> ALIGNMENT -> INSPECTION -> PLC HANDSHAKE -> INTERLOCK -> WAIT_PART_REMOVAL
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { soundService } from '../services/audio';
import { dbService } from '../services/db';
import { plcService } from '../services/plc/plcService';
import { getRuntimeIdentity } from '../services/runtimeConfig';
import {
  AlignmentResult,
  ExtraDetectedObject,
  InspectionMachineState,
  InspectionRecord,
  InspectionStats,
  ROIInspectionResult,
  SystemMetrics,
} from '../types/inspection';
import { MasterProduct, MasterRevision } from '../types/master';
import { PLCHandshakeState, PLCLiveSignals } from '../types/plc';
import { alignmentEngine } from '../vision/alignmentEngine';
import { getRegionStats, toGrayscale } from '../vision/imageUtils';
import { PresenceDetector } from '../vision/presenceDetector';
import { roiInspector } from '../vision/roiInspector';
import { ruleEngine } from '../vision/ruleEngine';
import { preprocessInspectionFrame } from '../vision/opencvEngine';

export interface UseInspectionPipelineProps {
  activeMaster: MasterProduct | null;
  activeRevision: MasterRevision | null;
  captureFrame: () => ImageData | null;
  cameraState: string;
  fps: number;
}

export function useInspectionPipeline({
  activeMaster,
  activeRevision,
  captureFrame,
  cameraState,
  fps,
}: UseInspectionPipelineProps) {
  const [state, setState] = useState<InspectionMachineState>('WAITING_FOR_PART');
  const [stabilizationProgress, setStabilizationProgress] = useState<number>(0);
  const [motionDelta, setMotionDelta] = useState<number>(0);

  // Latest inspection data
  const [currentResult, setCurrentResult] = useState<InspectionRecord | null>(null);
  const [latestAlignment, setLatestAlignment] = useState<AlignmentResult | null>(null);
  const [latestRoiResults, setLatestRoiResults] = useState<ROIInspectionResult[]>([]);
  const [latestExtraObjects, setLatestExtraObjects] = useState<ExtraDetectedObject[]>([]);
  const [stats, setStats] = useState<InspectionStats>({
    totalInspected: 0,
    totalOk: 0,
    totalNg: 0,
    totalErrors: 0,
    yieldRate: 100,
    lastCycleTimeMs: 0,
    averageCycleTimeMs: 0,
  });

  // Diagnostics breakdown
  const [liveMetrics, setLiveMetrics] = useState<SystemMetrics>({
    cameraFps: 0,
    partDetectionMs: 0,
    stabilizationMs: 500,
    alignmentMs: 0,
    roiDetectionMs: 0,
    ruleValidationMs: 0,
    dbSaveMs: 0,
    totalCycleMs: 0,
    frameResolution: { width: 800, height: 600 },
  });

  // PLC Live State
  const [plcHandshake, setPlcHandshake] = useState<PLCHandshakeState>(plcService.getHandshakeState());
  const [plcSignals, setPlcSignals] = useState<PLCLiveSignals>(plcService.getSignals());

  // Internal state tracking
  const presenceDetectorRef = useRef<PresenceDetector>(new PresenceDetector());
  const isProcessingRef = useRef<boolean>(false);
  const detectionStartTimeRef = useRef<number>(0);
  const cycleStartTimeRef = useRef<number>(0);
  const activeMasterRef = useRef<MasterProduct | null>(activeMaster);
  const activeRevisionRef = useRef<MasterRevision | null>(activeRevision);
  const lastStabProgressRef = useRef<number>(0);
  const lastMotionDeltaRef = useRef<number>(0);
  const lastUiTickRef = useRef<number>(0);

  useEffect(() => {
    activeMasterRef.current = activeMaster;
    activeRevisionRef.current = activeRevision;
  }, [activeMaster, activeRevision]);

  // Load initial stats and subscribe to PLC state
  useEffect(() => {
    dbService.getStats().then(setStats).catch(console.error);

    const unsubscribe = plcService.subscribe((hs, sigs) => {
      setPlcHandshake(hs);
      setPlcSignals(sigs);
    });

    return () => unsubscribe();
  }, []);

  // Reset state when master/revision changes
  const resetPipeline = useCallback(() => {
    presenceDetectorRef.current.resetPartState();
    setState('WAITING_FOR_PART');
    setStabilizationProgress(0);
    setMotionDelta(0);
    setCurrentResult(null);
    setLatestAlignment(null);
    setLatestRoiResults([]);
    setLatestExtraObjects([]);
    detectionStartTimeRef.current = 0;
    cycleStartTimeRef.current = 0;
    isProcessingRef.current = false;
    plcService.clearInterlock();
  }, []);

  // Calibrate current empty background
  const calibrateBackground = useCallback(() => {
    const frame = captureFrame();
    if (!frame || !activeRevisionRef.current) return;
    const gray = toGrayscale(frame);
    const dz = activeRevisionRef.current.detectionZone;
    const rx = dz.x * gray.width;
    const ry = dz.y * gray.height;
    const rw = dz.width * gray.width;
    const rh = dz.height * gray.height;

    const regionStats = getRegionStats(gray, rx, ry, rw, rh);
    presenceDetectorRef.current.setBaseline(regionStats);
  }, [captureFrame]);

  // Execute actual inspection on settled frame
  const executeInspection = useCallback(
    async (frameData: ImageData, partDetectTime: number, stabTime: number) => {
      const master = activeMasterRef.current;
      const revision = activeRevisionRef.current;
      if (!master || !revision) return;

      const cycleStart = performance.now();

      try {
        setState('ALIGNING');
      plcService.logTimelineEvent('ALIGNMENT_STARTED', 'VISION', 'Locating reference fiducials A, B, C, D');

      // OpenCV 5 preprocessing is intentionally performed on the captured
      // inspection frame (not only as a demo/diagnostic path). The resulting
      // normalized grayscale image feeds the existing alignment and ROI engines.
      const opencvFrame = await preprocessInspectionFrame(frameData);
      const gray = opencvFrame.gray;
      console.debug('[OpenCV 5] inspection preprocessing', {
        processingMs: Math.round(opencvFrame.processingMs),
        edgeDensity: Number(opencvFrame.edgeDensity.toFixed(4)),
      });

      // 1. Reference Alignment
      const alignStart = performance.now();
      const alignment = alignmentEngine.calculateAlignment(
        gray,
        revision.masterWidth,
        revision.masterHeight,
        revision.anchors,
        revision.tolerance
      );
      const alignTime = performance.now() - alignStart;
      setLatestAlignment(alignment);

      if (alignment.success) {
        plcService.logTimelineEvent('ALIGNMENT_SUCCESS', 'VISION', `Aligned with ${alignment.matchedAnchorCount} anchors (Rot: ${alignment.rotationDeg}°)`);
      } else {
        plcService.logTimelineEvent('ALIGNMENT_FAILED', 'VISION', alignment.errorMessage || 'Anchors not found');
      }

      // 2. Transformed ROI Detection
      // IMPORTANT: ROI inspection is only valid after successful alignment.
      // If alignment fails, the Rule Engine must receive empty ROI results so
      // it can classify the cycle as a SYSTEM ERROR rather than Product NG.
      let roiResults: ROIInspectionResult[] = [];
      let extraObjects: ExtraDetectedObject[] = [];
      let roiTime = 0;

      if (alignment.success) {
        setState('INSPECTING');
        plcService.logTimelineEvent(
          'ROI_INSPECTION_STARTED',
          'VISION',
          `Evaluating ${revision.inspectionROIs.length} transformed screw ROIs`
        );

        const roiStart = performance.now();
        const inspection = await roiInspector.inspectROIs(
          gray,
          revision.inspectionROIs,
          alignment,
          revision.tolerance
        );

        roiResults = inspection.roiResults;
        extraObjects = inspection.extraObjects;
        roiTime = performance.now() - roiStart;

        setLatestRoiResults(roiResults);
        setLatestExtraObjects(extraObjects);
      } else {
        setState('INSPECTION_ERROR');
        setLatestRoiResults([]);
        setLatestExtraObjects([]);

        plcService.logTimelineEvent(
          'ROI_INSPECTION_SKIPPED',
          'VISION',
          `ROI inspection skipped because alignment failed: ${alignment.errorMessage || 'Unknown alignment error'}`
        );
      }

      // 3. Rule Engine Judgement
      const ruleStart = performance.now();
      const evaluation = ruleEngine.evaluate(revision, alignment, roiResults, extraObjects);
      const ruleTime = performance.now() - ruleStart;

      plcService.logTimelineEvent(
        'INSPECTION_COMPLETE',
        'VISION',
        `Judgement: ${evaluation.judgement} - ${evaluation.primaryReason}`
      );

      // 4. Create thumbnail for traceability
      let thumbnailBase64 = '';
      try {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 160;
        thumbCanvas.height = 120;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = frameData.width;
          tempCanvas.height = frameData.height;
          tempCanvas.getContext('2d')?.putImageData(frameData, 0, 0);
          thumbCtx.drawImage(tempCanvas, 0, 0, 160, 120);
          thumbnailBase64 = thumbCanvas.toDataURL('image/jpeg', 0.6);
        }
      } catch {
        // Thumbnail generation failure is non-fatal
      }

      const totalInspectionMs = Math.round(performance.now() - cycleStart);
      const totalCycleMs = Math.round(partDetectTime + stabTime + totalInspectionMs);

      // 5. Enforce a hard inspection-time budget before touching the machine interlock.
      // A slow/overloaded vision cycle is a system error, never an implicit OK.
      let resultJudgement: 'OK' | 'NG' | 'ERROR' = evaluation.judgement;
      let resultReason = evaluation.primaryReason;
      if (totalInspectionMs > plcService.getConfig().maxInspectionTimeoutMs) {
        resultJudgement = 'ERROR';
        resultReason = 'Inspection timeout: ' + totalInspectionMs + ' ms exceeded configured limit';
        plcService.logTimelineEvent('INSPECTION_TIMEOUT', 'INTERLOCK', resultReason);
      }

      // Explicitly separate Product NG from Vision System Error.
      const isProductNg = resultJudgement === 'NG';
      const isSystemError = resultJudgement === 'ERROR';

      const inspectionId = `INSP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const plcSequenceNumber = plcService.getHandshakeState().lastSequenceNumber;
      const plcHandshakeResult = await plcService.sendResultAndHandshake({
        sequenceNumber: plcSequenceNumber,
        inspectionId,
        timestamp: new Date().toISOString(),
        productCode: master.productCode,
        revisionCode: revision.revisionCode,
        judgement: resultJudgement,
        isProductNg,
        isSystemError,
        failureReason: resultReason,
        detectedCount: evaluation.detectedCount,
        expectedCount: evaluation.expectedCount,
        alignmentOk: alignment.success,
        cycleTimeMs: totalCycleMs,
      });

      // A missing PLC ACK is a system fault. Never report the product as OK when
      // the machine-side handshake could not be confirmed.
      if (!plcHandshakeResult.ackReceived) {
        resultJudgement = 'ERROR';
        resultReason = 'PLC result ACK was not received; process remains blocked';
        plcService.logTimelineEvent('HANDSHAKE_FAILED', 'INTERLOCK', resultReason);
      }

      const identity = getRuntimeIdentity();

      // 6. Metrics collection
      const metrics: SystemMetrics = {
        cameraFps: fps,
        partDetectionMs: Math.round(partDetectTime),
        stabilizationMs: Math.round(stabTime),
        alignmentMs: Math.round(alignTime),
        roiDetectionMs: Math.round(roiTime),
        ruleValidationMs: Math.round(ruleTime),
        dbSaveMs: 0,
        plcHandshakeMs: plcHandshakeResult.commLatencyMs,
        totalCycleMs: totalCycleMs + plcHandshakeResult.commLatencyMs,
        frameResolution: {
          width: frameData.width,
          height: frameData.height,
        },
      };

      const record: InspectionRecord = {
        id: inspectionId,
        timestamp: new Date().toISOString(),
        productId: master.id,
        productCode: master.productCode,
        productName: master.productName,
        masterId: master.id,
        masterRevisionId: revision.id,
        masterRevisionCode: revision.revisionCode,
        judgement: resultJudgement,
        expectedCount: evaluation.expectedCount,
        detectedCount: evaluation.detectedCount,
        defects: evaluation.defects,
        primaryReason: resultReason,
        metrics,
        alignment,
        roiResults,
        extraObjects,
        thumbnailBase64,
        deviceId: identity.stationId,
        operatorId: identity.operatorId,
        syncedToCloud: false,
        sequenceNumber: plcSequenceNumber,
        plcInterlockState: plcService.getHandshakeState().interlockState,
        plcCommLatencyMs: plcHandshakeResult.commLatencyMs,
        plcTimeline: [...plcService.getHandshakeState().activeCycleTimeline],
      };

      setCurrentResult(record);

      // 7. Audio Feedback and State Display
      if (resultJudgement === 'OK') {
        setState('JUDGEMENT_OK');
        soundService.playPassChime();
      } else if (resultJudgement === 'NG') {
        setState('JUDGEMENT_NG');
        soundService.playFailBuzzer();
      } else {
        setState(!alignment.success ? 'ALIGNMENT_ERROR' : 'SYSTEM_ERROR');
        soundService.playFailBuzzer();
      }

      // 8. Asynchronous Database Persistence (Non-blocking)
      const dbSaveStart = performance.now();
      dbService
        .saveInspectionRecord(record)
        .then(async () => {
          metrics.dbSaveMs = Math.round(performance.now() - dbSaveStart);
          setLiveMetrics(metrics);
          const newStats = await dbService.getStats();
          setStats(newStats);
        })
        .catch(console.error);

      // 9. Freeze the completed judgement. The live loop owns the lifecycle
      // from this point: removal or repositioning can re-arm the part without
      // relying on a stale timeout.
      presenceDetectorRef.current.markPartInspected();
      isProcessingRef.current = false;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error('[InspectionPipeline] Inspection cycle failed:', error);

      plcService.logTimelineEvent(
        'INSPECTION_ERROR',
        'VISION',
        `Inspection cycle aborted: ${message}`
      );

      // Never allow an exception to leave the pipeline permanently locked.
      setState('SYSTEM_ERROR');
      soundService.playFailBuzzer();

      try {
        plcService.clearInterlock();
      } catch (interlockError) {
        console.error(
          '[InspectionPipeline] Failed to clear PLC interlock:',
          interlockError
        );
      }

      presenceDetectorRef.current.markPartInspected();
      isProcessingRef.current = false;
      }
    }, [fps]);

  // Main real-time pipeline tick loop (~20 FPS)
  useEffect(() => {
    if (cameraState === 'error' || cameraState === 'permission_denied') return;
    if (!activeRevision) return;

    const interval = setInterval(() => {
      if (isProcessingRef.current) return;

      const frameData = captureFrame();
      if (!frameData) return;

      const gray = toGrayscale(frameData);
      const now = Date.now();

      // Process presence through detection zone
      const presence = presenceDetectorRef.current.processFrame(
        gray,
        activeRevision.detectionZone,
        activeRevision.tolerance,
        now
      );

      // Throttle UI progress updates so React doesn't re-render 20 times/sec
      if (
        Math.abs(presence.stabilizationProgress - lastStabProgressRef.current) >= 0.08 ||
        presence.stabilizationProgress === 1 ||
        presence.stabilizationProgress === 0
      ) {
        lastStabProgressRef.current = presence.stabilizationProgress;
        setStabilizationProgress(presence.stabilizationProgress);
      }

      if (now - lastUiTickRef.current >= 400 || Math.abs(presence.motionDelta - lastMotionDeltaRef.current) >= 1.5) {
        lastUiTickRef.current = now;
        lastMotionDeltaRef.current = presence.motionDelta;
        setMotionDelta(presence.motionDelta);
      }

      const awaitingRemoval = presenceDetectorRef.current.isAwaitingRemoval();

      // Post-judgement lifecycle:
      // 1) If the part leaves the detection zone, reset normally.
      // 2) If the same part is moved/corrected while still visible, detect the
      //    repositioning and immediately re-arm it. This prevents the previous
      //    OK/NG judgement from staying latched after the operator changes the
      //    part position.
      if (awaitingRemoval) {
        if (!presence.isPartPresent) {
          presenceDetectorRef.current.resetPartState();
          plcService.clearInterlock();
          setState('WAITING_FOR_PART');
          setCurrentResult(null);
          setLatestAlignment(null);
          setLatestRoiResults([]);
          setLatestExtraObjects([]);
          detectionStartTimeRef.current = 0;
          return;
        }

        const repositioned = presenceDetectorRef.current.detectPostInspectionReposition(
          presence.motionDelta,
          activeRevision.tolerance
        );

        if (repositioned) {
          // Invalidate the old judgement immediately. The next stable frame
          // sequence must go through the complete 6-reference inspection again.
          presenceDetectorRef.current.rearmCurrentPart(now);
          plcService.clearInterlock();
          setState('WAITING_FOR_PART');
          setCurrentResult(null);
          setLatestAlignment(null);
          setLatestRoiResults([]);
          setLatestExtraObjects([]);
          setStabilizationProgress(0);
          setMotionDelta(presence.motionDelta);
          detectionStartTimeRef.current = 0;
          cycleStartTimeRef.current = 0;

          plcService.logTimelineEvent(
            'PART_REPOSITIONED_REARM',
            'VISION',
            'Part movement detected after judgement; previous OK/NG cleared and inspection re-armed'
          );
        } else if (
          state !== 'WAITING_PART_REMOVAL' &&
          state !== 'JUDGEMENT_OK' &&
          state !== 'JUDGEMENT_NG' &&
          state !== 'ALIGNMENT_ERROR' &&
          state !== 'SYSTEM_ERROR'
        ) {
          setState('WAITING_PART_REMOVAL');
        }

        return;
      }

      // Check configured Trigger Mode (AUTO_CAMERA vs PLC vs HYBRID)
      const plcCfg = plcService.getConfig();
      const plcLive = plcService.getSignals();

      let isTriggered = false;
      let triggerSource: 'VISION_AUTO' | 'PLC_TRIGGER' | 'HYBRID' = 'VISION_AUTO';

      if (plcCfg.triggerMode === 'AUTO_CAMERA') {
        isTriggered = presence.isPartPresent;
        triggerSource = 'VISION_AUTO';
      } else if (plcCfg.triggerMode === 'PLC') {
        isTriggered = plcLive.partPresent;
        triggerSource = 'PLC_TRIGGER';
      } else {
        // HYBRID MODE: PLC part present sensor + Vision presence confirmation
        isTriggered = plcLive.partPresent && presence.isPartPresent;
        triggerSource = 'HYBRID';
      }

      // Normal flow: Part has not been triggered yet
      if (!isTriggered) {
        if (state !== 'WAITING_FOR_PART') {
          setState('WAITING_FOR_PART');
        }
        detectionStartTimeRef.current = 0;
        return;
      }

      // Part is present in detection area / triggered by PLC
      if (detectionStartTimeRef.current === 0) {
        detectionStartTimeRef.current = now;
        cycleStartTimeRef.current = now;
        soundService.playDetectPip();
        // Start cycle in PLC service (invalidates previous results for stale result prevention)
        plcService.startNewCycle(triggerSource);
        plcService.logTimelineEvent('PART_DETECTED', 'VISION', 'Part entered station detection area');
      }

      if (!presence.isStabilized) {
        if (state !== 'STABILIZING') {
          setState('STABILIZING');
        }
        return;
      }

      // Part has stabilized for 500 ms! Trigger Capture & Inspect
      isProcessingRef.current = true;
      setState('CAPTURING');
      plcService.logTimelineEvent('STABILIZATION_COMPLETE', 'VISION', '500 ms stabilization settlement complete');

      const partDetectDuration = 45; // Approx detection latency
      const stabDuration = activeRevision.tolerance.stabilizationDelayMs || 500;

      // Run inspection asynchronously
      requestAnimationFrame(() => {
        executeInspection(frameData, partDetectDuration, stabDuration);
      });
    }, 50); // 20 ticks per second

    return () => clearInterval(interval);
  }, [activeRevision, cameraState, captureFrame, executeInspection, state]);

  return {
    state,
    stabilizationProgress,
    motionDelta,
    currentResult,
    latestAlignment,
    latestRoiResults,
    latestExtraObjects,
    stats,
    liveMetrics,
    plcHandshake,
    plcSignals,
    resetPipeline,
    calibrateBackground,
  };
}
