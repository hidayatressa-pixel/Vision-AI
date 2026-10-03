/**
 * Camera Stream Hook
 * Handles smartphone device camera access, device switching,
 * frame capture, and seamless test mode simulation with strict stability controls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawWorkpieceToCanvas, TestScenarioType } from '../vision/testGenerator';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface UseCameraOptions {
  preferredFacingMode?: 'environment' | 'user';
  preferredResolution?: { width: number; height: number };
}

export function useCamera(options: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const optionsRef = useRef<UseCameraOptions>(options);
  optionsRef.current = options;

  const currentDeviceIdRef = useRef<string>('');
  const isStartingRef = useRef<boolean>(false);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraState, setCameraState] = useState<
    'initializing' | 'streaming' | 'error' | 'permission_denied' | 'virtual_mode'
  >('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [fps, setFps] = useState<number>(0);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Virtual test generator mode for offline / stand simulation
  const [virtualScenario, setVirtualScenario] = useState<TestScenarioType>('PERFECT_PASS');
  const [isVirtualMode, setIsVirtualMode] = useState<boolean>(false);

  // FPS calculation
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  // Enumerate cameras
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = allDevices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
      setDevices(videoDevs);
    } catch {
      // Permission might be pending
    }
  }, []);

  // Initialize camera stream safely without unnecessary teardowns
  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (isVirtualMode) return;
      if (isStartingRef.current) return;

      const targetDevice = deviceId || '';

      // If camera is already streaming on this target device, do NOT tear it down!
      if (
        streamRef.current &&
        streamRef.current.active &&
        currentDeviceIdRef.current === targetDevice &&
        cameraState === 'streaming'
      ) {
        return;
      }

      isStartingRef.current = true;
      setCameraState('initializing');
      setErrorMessage('');

      // Stop existing tracks safely
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Device camera API not supported in this browser environment');
        }

        const facingMode = optionsRef.current.preferredFacingMode || 'environment';
        const prefWidth = optionsRef.current.preferredResolution?.width || 1280;
        const prefHeight = optionsRef.current.preferredResolution?.height || 720;

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: targetDevice ? { exact: targetDevice } : undefined,
            facingMode: targetDevice ? undefined : { ideal: facingMode },
            width: { ideal: prefWidth },
            height: { ideal: prefHeight },
            frameRate: { ideal: 30, max: 60 },
          },
          audio: false,
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (constraintErr) {
          console.warn('Initial constraints rejected, attempting basic mobile camera fallback:', constraintErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } },
            audio: false,
          });
        }

        streamRef.current = stream;
        currentDeviceIdRef.current = targetDevice;

        if (videoRef.current) {
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
          }
          try {
            await videoRef.current.play();
          } catch {
            // Auto-play might be pending interaction
          }
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          setVideoDimensions({
            width: settings.width || 800,
            height: settings.height || 600,
          });
        }

        setCameraState('streaming');
        refreshDevices();
      } catch (err: unknown) {
        const error = err as Error;
        console.warn('Physical camera initialization notice:', error.message);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setCameraState('permission_denied');
          setErrorMessage('Camera access was denied by the browser.');
        } else {
          setCameraState('error');
          setErrorMessage(error.message || 'Unable to access video camera');
        }
      } finally {
        isStartingRef.current = false;
      }
    },
    [isVirtualMode, refreshDevices, cameraState]
  );

  // Switch to virtual simulation mode
  const enableVirtualMode = useCallback((scenario: TestScenarioType = 'PERFECT_PASS') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    currentDeviceIdRef.current = '';
    setIsVirtualMode(true);
    setVirtualScenario(scenario);
    setCameraState('virtual_mode');
    setVideoDimensions({ width: 800, height: 600 });
  }, []);

  // Switch to physical camera mode
  const enablePhysicalCamera = useCallback(() => {
    setIsVirtualMode(false);
    startCamera(selectedDeviceId);
  }, [selectedDeviceId, startCamera]);

  // Only start camera on mount or when switching selectedDeviceId or exiting virtual mode
  useEffect(() => {
    if (!isVirtualMode) {
      startCamera(selectedDeviceId);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [selectedDeviceId, isVirtualMode]); // Stable dependencies: no object/function recreation

  // Capture current frame as ImageData from video or virtual canvas
  const captureFrame = useCallback((): ImageData | null => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const w = videoDimensions.width;
    const h = videoDimensions.height;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    if (isVirtualMode || cameraState === 'virtual_mode') {
      drawWorkpieceToCanvas(ctx, w, h, virtualScenario);
    } else if (videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, w, h);
    } else {
      return null;
    }

    // Update FPS smoothly
    frameCountRef.current++;
    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current)));
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    return ctx.getImageData(0, 0, w, h);
  }, [cameraState, isVirtualMode, videoDimensions, virtualScenario]);

  return {
    videoRef,
    canvasRef,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    cameraState,
    errorMessage,
    fps,
    videoDimensions,
    captureFrame,
    isVirtualMode,
    virtualScenario,
    setVirtualScenario,
    enableVirtualMode,
    enablePhysicalCamera,
    startCamera,
  };
}
