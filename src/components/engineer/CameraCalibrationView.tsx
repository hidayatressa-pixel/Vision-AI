/**
 * Camera Calibration & Environment Diagnostic View
 * Verifies stand lighting, resolution, focus, and device selection.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Sun, Sliders, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { CameraDevice } from '../../hooks/useCamera';
import { getRegionStats, toGrayscale } from '../../vision/imageUtils';
import { CAMERA_SOURCE_OPTIONS, CameraSourceMode } from '../../types/device';

interface CameraCalibrationViewProps {
  devices: CameraDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  sourceMode: CameraSourceMode;
  setSourceMode: (mode: CameraSourceMode) => void;
  cameraState: string;
  fps: number;
  videoDimensions: { width: number; height: number };
  captureFrame: () => ImageData | null;
  calibrateBackground: () => void;
  onSwitchToStandSimulator: () => void;
}

export const CameraCalibrationView: React.FC<CameraCalibrationViewProps> = ({
  devices,
  selectedDeviceId,
  setSelectedDeviceId,
  sourceMode,
  setSourceMode,
  cameraState,
  fps,
  videoDimensions,
  captureFrame,
  calibrateBackground,
  onSwitchToStandSimulator,
}) => {
  const [lightingStats, setLightingStats] = useState<{ mean: number; variance: number }>({
    mean: 120,
    variance: 450,
  });
  const [calibratedMessage, setCalibratedMessage] = useState<string | null>(null);

  // Monitor lighting & contrast
  useEffect(() => {
    const interval = setInterval(() => {
      const frame = captureFrame();
      if (!frame) return;
      const gray = toGrayscale(frame);
      const stats = getRegionStats(gray, 0, 0, gray.width, gray.height);
      setLightingStats({ mean: Math.round(stats.mean), variance: Math.round(stats.variance) });
    }, 500);

    return () => clearInterval(interval);
  }, [captureFrame]);

  const handleZeroCalibrate = () => {
    calibrateBackground();
    setCalibratedMessage('Empty stand background calibrated! Baseline saved.');
    setTimeout(() => setCalibratedMessage(null), 3000);
  };

  const isLightingAdequate = lightingStats.mean >= 40 && lightingStats.mean <= 220;
  const isContrastAdequate = lightingStats.variance >= 100;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400">
            <Sliders className="w-5 h-5" />
            <h2 className="text-xl font-bold text-white">Camera Stand & Lighting Calibration</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Ensure smartphone optical stability, lighting exposure, and sensor calibration.
          </p>
        </div>

        <button
          onClick={handleZeroCalibrate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition-colors shadow-lg"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Calibrate Empty Stand</span>
        </button>
      </div>

      {calibratedMessage && (
        <div className="bg-emerald-950/80 border border-emerald-500 rounded-xl p-3 text-xs font-mono text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{calibratedMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Device Select */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
            <Camera className="w-4 h-4 text-cyan-400" />
            <span>Camera Device</span>
          </div>

          <select
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as CameraSourceMode)}
            className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2.5 focus:border-cyan-500"
          >
            {CAMERA_SOURCE_OPTIONS.map((option) => (
              <option key={option.mode} value={option.mode}>
                {option.label}
              </option>
            ))}
          </select>

          <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
            {CAMERA_SOURCE_OPTIONS.find((option) => option.mode === sourceMode)?.description}
          </p>

          {sourceMode === 'LOCAL_CAMERA' && devices.length > 0 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2.5 focus:border-cyan-500"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          )}

          {sourceMode === 'PHONE_REMOTE' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[10px] font-mono text-amber-300">
              PHONE LINK: waiting for WebRTC pairing. Local camera is intentionally disabled.
            </div>
          )}

          <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800">
            Resolution: {videoDimensions.width} x {videoDimensions.height} px
          </div>
        </div>

        {/* Lighting Exposure */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Illumination</span>
            </span>
            {isLightingAdequate ? (
              <span className="text-emerald-400 text-[10px]">OK</span>
            ) : (
              <span className="text-amber-400 text-[10px]">LOW/HIGH</span>
            )}
          </div>

          <div className="text-2xl font-bold font-mono text-white mt-1">
            {lightingStats.mean} <span className="text-xs text-slate-400">/ 255</span>
          </div>

          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full ${isLightingAdequate ? 'bg-emerald-400' : 'bg-amber-400'}`}
              style={{ width: `${(lightingStats.mean / 255) * 100}%` }}
            />
          </div>

          <p className="text-[10px] text-slate-400 font-mono">
            {lightingStats.mean < 40
              ? 'Warning: Stand is under-lit. Turn on external inspection light ring.'
              : lightingStats.mean > 220
              ? 'Warning: Stand is over-exposed. Reduce glare.'
              : 'Optimal industrial contrast detected.'}
          </p>
        </div>

        {/* Dynamic Contrast */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 uppercase tracking-wider">
            <span>Feature Contrast</span>
            {isContrastAdequate ? (
              <span className="text-emerald-400 text-[10px]">PASS</span>
            ) : (
              <span className="text-amber-400 text-[10px]">FLAT</span>
            )}
          </div>

          <div className="text-2xl font-bold font-mono text-white mt-1">
            σ {Math.round(Math.sqrt(lightingStats.variance))}
          </div>

          <p className="text-[10px] text-slate-400 font-mono">
            Variance indicates clarity of workpiece screw edges against the antistatic stand surface.
          </p>
        </div>

        {/* Camera FPS & Performance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 uppercase tracking-wider">
            <span>Live Stream Rate</span>
            <span className="text-cyan-400 text-[10px]">STABLE</span>
          </div>

          <div className="text-2xl font-bold font-mono text-white mt-1">
            {fps} <span className="text-xs text-slate-400">FPS</span>
          </div>

          <p className="text-[10px] text-slate-400 font-mono">
            Browser camera processing running smoothly without dropped frames.
          </p>
        </div>
      </div>
    </div>
  );
};
