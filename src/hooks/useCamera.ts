/**
 * Camera Stream Hook
 * Handles smartphone device camera access, device switching,
 * frame capture, and seamless test mode simulation with strict stability controls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawWorkpieceToCanvas, TestScenarioType } from '../vision/testGenerator';
import { CameraSourceMode } from '../types/device';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface UseCameraOptions {
  preferredFacingMode?: 'environment' | 'user';
  preferredResolution?: { width: number; height: number };
  sourceMode?: CameraSourceMode;
}

export function useCamera(options: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const optionsRef = useRef<UseCameraOptions>(options);
  optionsRef.current = options;
  const sourceMode = options.sourceMode || 'LOCAL_CAMERA';

  const currentDeviceIdRef = useRef<string>('');
  const isStartingRef = useRef<boolean>(false);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraState, setCameraState] = useState<
    'initializing' | 'streaming' | 'error' | 'permission_denied' | 'virtual_mode' | 'remote_waiting'
  >('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [fps, setFps] = useState<number>(0);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Remote-phone mode intentionally stops local capture until the WebRTC
  // transport attaches a remote MediaStream. The Vision pipeline remains
  // unchanged because it still consumes captureFrame().
  const stopLocalStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    currentDeviceIdRef.current = '';
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

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
      // Do not gate startup on the captured React state here. When the user
      // switches from simulator to the physical camera, setIsVirtualMode(false)
      // is asynchronous and this callback can briefly see the previous state.
      // The effect below is the authoritative starter after the state change.
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
          const intrinsicWidth = videoRef.current?.videoWidth || settings.width || 800;
          const intrinsicHeight = videoRef.current?.videoHeight || settings.height || 600;
          setVideoDimensions({
            width: intrinsicWidth,
            height: intrinsicHeight,
          });
        }

        // Some browsers populate videoWidth/videoHeight only after metadata is
        // loaded. Refresh the processing canvas dimensions from the real video
        // buffer instead of assuming a synthetic 800x600 frame.
        const video = videoRef.current;
        if (video) {
          const syncVideoDimensions = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setVideoDimensions({
                width: video.videoWidth,
                height: video.videoHeight,
              });
            }
          };
          if (video.readyState >= 1) syncVideoDimensions();
          video.addEventListener('loadedmetadata', syncVideoDimensions, { once: true });
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

  // Select the physical/remote/virtual camera source.
  const setCameraSourceMode = useCallback((mode: CameraSourceMode) => {
    if (mode === 'PHONE_REMOTE') {
      stopLocalStream();
      setIsVirtualMode(false);
      setCameraState('remote_waiting');
      setErrorMessage('Waiting for phone camera pairing.');
      return;
    }

    if (mode === 'VIRTUAL') {
      enableVirtualMode(virtualScenario);
      return;
    }

    setIsVirtualMode(false);
    setCameraState('initializing');
    setErrorMessage('');
  }, [enableVirtualMode, stopLocalStream, virtualScenario]);

  // Switch to physical camera mode
  const enablePhysicalCamera = useCallback(() => {
    // Let the state transition trigger the stable startup effect. Calling
    // startCamera in the same event can race with the old virtual-mode state.
    setIsVirtualMode(false);
    setCameraState('initializing');
    setErrorMessage('');
  }, []);

  // Only start camera on mount or when switching selectedDeviceId or exiting virtual mode
  useEffect(() => {
    if (sourceMode === 'PHONE_REMOTE') {
      stopLocalStream();
      setIsVirtualMode(false);
      setCameraState('remote_waiting');
      return;
    }

    if (sourceMode === 'VIRTUAL') {
      stopLocalStream();
      setIsVirtualMode(true);
      setCameraState('virtual_mode');
      setVideoDimensions({ width: 800, height: 600 });
      return;
    }

    if (!isVirtualMode) {
      startCamera(selectedDeviceId);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [selectedDeviceId, isVirtualMode, sourceMode, startCamera, stopLocalStream]); // Stable dependencies: no object/function recreation

  // Keep the video element lifecycle independent from the WebRTC connection.
  // The inspection screen can be mounted/unmounted while the remote stream is already
  // connected (for example when switching from Camera Setup to Inspection). A callback
  // ref guarantees the stored MediaStream is attached whenever the <video> element exists.
  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video || !streamRef.current) return;

    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      // The browser may require a user gesture before playback.
    });

    const syncVideoDimensions = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    if (video.readyState >= 1) syncVideoDimensions();
    video.addEventListener('loadedmetadata', syncVideoDimensions, { once: true });
  }, []);

  // Attach a remote phone MediaStream to the same video element used by the
  // existing Vision pipeline. OpenCV does not need to know where the frames came from.
  const attachRemoteStream = useCallback(async (stream: MediaStream) => {
    if (streamRef.current && streamRef.current !== stream) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setIsVirtualMode(false);
    streamRef.current = stream;
    currentDeviceIdRef.current = 'REMOTE_PHONE';

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
    }
    if (video) {
      try {
        await video.play();
      } catch {
        // The browser may require a user gesture before playback.
      }

      const syncVideoDimensions = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
        }
      };

      if (video.readyState >= 1) syncVideoDimensions();
      video.addEventListener('loadedmetadata', syncVideoDimensions, { once: true });
    }

    // Mark the transport as streaming even if the inspection <video> element is
    // temporarily unmounted. The callback ref above will attach the stream later.
    setCameraState('streaming');
    setErrorMessage('');
  }, []);

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

    if (cameraState === 'remote_waiting') return null;

    if (isVirtualMode || cameraState === 'virtual_mode' || sourceMode === 'VIRTUAL') {
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
  }, [cameraState, isVirtualMode, sourceMode, videoDimensions, virtualScenario]);

  return {
    videoRef: setVideoElement,
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
    attachRemoteStream,
    sourceMode,
    setCameraSourceMode,
  };
}
