/**
 * Realtime Vision Inspection System
 * Manufacturing zero-touch automated visual inspection platform.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActiveTab, Navbar, UserRole } from './components/Navbar';
import { CameraCalibrationView } from './components/engineer/CameraCalibrationView';
import { MasterManager } from './components/engineer/MasterManager';
import { MasterSetupModal } from './components/engineer/MasterSetupModal';
import { PLCConfigurationView } from './components/engineer/PLCConfigurationView';
import { InspectionHistoryView } from './components/history/InspectionHistoryView';
import { DiagnosticsModal } from './components/diagnostics/DiagnosticsModal';
import { LiveInspectionView } from './components/operator/LiveInspectionView';
import { SettingsView } from './components/settings/SettingsView';
import { useCamera } from './hooks/useCamera';
import { useInspectionPipeline } from './hooks/useInspectionPipeline';
import { soundService } from './services/audio';
import { dbService } from './services/db';
import { initSeedDataIfEmpty, SEED_PRODUCT_A } from './services/sampleData';
import { MasterProduct, MasterRevision } from './types/master';
import { CameraSourceMode } from './types/device';
import { createRemoteCameraSession } from './services/remoteCamera';
import { PhoneCameraView } from './components/camera/PhoneCameraView';
import { getMasterValidationChecks } from './services/setupValidation';

function isPhoneCameraRoute() {
  const params = new URLSearchParams(window.location.search);
  return params.get('camera') === 'phone' && Boolean(params.get('session'));
}

export default function App() {
  if (isPhoneCameraRoute()) {
    return <PhoneCameraView />;
  }
  const [activeTab, setActiveTab] = useState<ActiveTab>('CAMERA_SETUP');
  const [role] = useState<UserRole>('OPERATOR');
  const [isMuted, setIsMuted] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [masters, setMasters] = useState<MasterProduct[]>([]);
  const [activeMaster, setActiveMaster] = useState<MasterProduct | null>(null);
  const [activeRevision, setActiveRevision] = useState<MasterRevision | null>(null);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [setupMaster, setSetupMaster] = useState<MasterProduct | null>(null);
  const [setupRevision, setSetupRevision] = useState<MasterRevision | null>(null);
  const [cameraSourceMode, setCameraSourceMode] = useState<CameraSourceMode>('LOCAL_CAMERA');
  const [remotePeerId, setRemotePeerId] = useState('');
  const [remoteStatus, setRemoteStatus] = useState<'idle' | 'starting' | 'waiting' | 'connected' | 'error'>('idle');
  const [processingFps, setProcessingFps] = useState(5);
  const [sessionActive, setSessionActive] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [setupValidated, setSetupValidated] = useState(false);
  const [setupValidationAttempted, setSetupValidationAttempted] = useState(false);
  const remoteSession = useMemo(() => createRemoteCameraSession(), []);

  const cameraOptions = React.useMemo(() => ({ preferredFacingMode: 'environment' as const, preferredResolution: { width: 800, height: 600 } }), []);
  const camera = useCamera({ ...cameraOptions, sourceMode: cameraSourceMode });
  const pipeline = useInspectionPipeline({ activeMaster, activeRevision, captureFrame: camera.captureFrame, cameraState: camera.cameraState, fps: camera.fps, processingFps, sessionActive });

  useEffect(() => {
    if (cameraSourceMode !== 'PHONE_REMOTE') {
      remoteSession.stop();
      setRemotePeerId('');
      setRemoteStatus('idle');
      return;
    }

    let cancelled = false;
    setRemoteStatus('starting');

    remoteSession
      .startController((stream) => {
        if (cancelled) return;
        camera.attachRemoteStream(stream);
        setRemoteStatus('connected');
      })
      .then((peerId) => {
        if (cancelled) return;
        setRemotePeerId(peerId);
        setRemoteStatus('waiting');
      })
      .catch((error) => {
        console.error('Remote camera controller error:', error);
        if (!cancelled) setRemoteStatus('error');
      });

    return () => {
      cancelled = true;
      remoteSession.stop();
    };
  }, [cameraSourceMode, remoteSession, camera.attachRemoteStream]);

  const phoneCameraUrl = remotePeerId
    ? `${window.location.origin}${import.meta.env.BASE_URL}?camera=phone&session=${encodeURIComponent(remotePeerId)}`
    : '';

  const loadMasters = async () => {
    await initSeedDataIfEmpty();
    const allMasters = await dbService.getAllMasters();
    setMasters(allMasters);
    if (allMasters.length > 0) {
      const current = activeMaster ? allMasters.find((m) => m.id === activeMaster.id) || allMasters[0] : allMasters[0];
      setActiveMaster(current);
      setActiveRevision(current.revisions.find((r) => r.id === current.activeRevisionId) || current.revisions[0]);
    }
  };

  useEffect(() => {
    loadMasters();
    dbService.getPendingSyncCount().then(setPendingSyncCount).catch(console.error);
  }, []);

  const handleSelectMaster = (master: MasterProduct, revisionId?: string) => {
    // Do not allow master/revision changes during an active inspection cycle.
    // This keeps the selected configuration aligned with the physical part
    // and prevents an operator action from bypassing the inspection latch.
    if (sessionActive || pipeline.state !== 'WAITING_FOR_PART') {
      return;
    }

    setActiveMaster(master);
    const revId = revisionId || master.activeRevisionId;
    setActiveRevision(master.revisions.find((r) => r.id === revId) || master.revisions[0]);
    pipeline.resetPipeline();
  };

  const handleOpenSetupModal = (master: MasterProduct, revision: MasterRevision) => {
    if (sessionActive) return;
    setSetupMaster(master); setSetupRevision(revision); setIsSetupModalOpen(true);
  };

  const handleCreateNewMaster = async () => {
    if (sessionActive) return;
    const newIdx = masters.length + 1;
    const now = new Date().toISOString();
    const productId = `prd-${newIdx}-${Date.now()}`;
    const revisionId = `rev-01-${Date.now()}`;
    const baseRevision = SEED_PRODUCT_A.revisions.find((revision) => revision.expectedObjectCount === 8) || SEED_PRODUCT_A.revisions[0];
    const newProduct: MasterProduct = {
      id: productId,
      productCode: `PRD-REFLECTOR-HL-GJRA-${String(newIdx).padStart(2, '0')}`,
      productName: 'Reflector Assy HL GJRA',
      description: 'New master cloned from the latest eight-screw production baseline.', activeRevisionId: revisionId, isActive: true,
      createdAt: now, updatedAt: now, createdBy: 'System Engineer',
      revisions: [{ ...baseRevision, id: revisionId, masterId: productId, revisionCode: 'REV-01', revisionNote: 'Initial production baseline', createdAt: now, updatedAt: now }],
    };
    await dbService.saveMaster(newProduct); await loadMasters(); handleSelectMaster(newProduct, revisionId);
  };

  const cameraReady = camera.cameraState === 'streaming' || camera.cameraState === 'virtual_mode';
  const masterValidationChecks = activeRevision ? getMasterValidationChecks(activeRevision) : [];
  const masterReady = Boolean(activeMaster && activeRevision) && masterValidationChecks.every((check) => check.valid);

  const handleNavigate = (tab: ActiveTab) => {
    // Initial setup behaves like an authentication gate. Until setup is
    // validated, navigation cannot bypass the required sequence.
    if (setupStep < 5) return;
    if (sessionActive && tab !== 'INSPECTION' && tab !== 'HISTORY') return;
    setActiveTab(tab);
  };

  const handleNextCameraSetup = () => {
    if (!cameraReady) return;
    setSetupStep(2);
    setActiveTab('MASTERS');
  };

  const handleBackToCameraSetup = () => {
    if (sessionActive) return;
    setSetupStep(1);
    setSetupValidated(false);
    setActiveTab('CAMERA_SETUP');
  };

  const handleNextMasterSetup = () => {
    // Step 3 is the validation center. Do not block the user here just
    // because the master is incomplete; let the validation center explain
    // exactly what is INVALID and how to fix it.
    if (!activeMaster || !activeRevision) return;
    setSetupStep(3);
    setSetupValidated(false);
    setSetupValidationAttempted(false);
    setActiveTab('MASTERS');
  };

  const handleSaveConfiguration = () => {
    setSetupValidationAttempted(true);

    if (!cameraReady || !activeMaster || !activeRevision) {
      setSetupValidated(false);
      return;
    }

    const invalidChecks = getMasterValidationChecks(activeRevision).filter((check) => !check.valid);
    if (invalidChecks.length > 0) {
      setSetupValidated(false);
      return;
    }

    setSetupValidated(true);
    setSetupValidationAttempted(false);
    setSetupStep(4);
  };

  const handleBackToMasterSetup = () => {
    if (sessionActive) return;
    setSetupValidated(false);
    setSetupValidationAttempted(false);
    setSetupStep(2);
    setActiveTab('MASTERS');
  };

  const handleStartSession = async () => {
    if (sessionActive || !setupValidated || !cameraReady || !masterReady) return;
    const started = await pipeline.startSession();
    if (started) {
      setSessionActive(true);
      setSetupStep(5);
      setActiveTab('INSPECTION');
    }
  };

  const handleEndSession = () => {
    if (pipeline.state !== 'WAITING_FOR_PART') return;
    pipeline.resetPipeline();
    setSessionActive(false);
    setSetupValidated(false);
    setSetupValidationAttempted(false);
    setSetupStep(1);
    setActiveTab('CAMERA_SETUP');
  };

  const handleSync = async () => { await dbService.flushSyncQueue(); setPendingSyncCount(await dbService.getPendingSyncCount()); };
  const toggleMute = () => { const next = !isMuted; setIsMuted(next); soundService.setMuted(next); };

  return (
    <div className="min-h-screen rvi-app text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Navbar activeTab={activeTab} setActiveTab={handleNavigate} role={role} setRole={() => undefined} activeMaster={activeMaster} activeRevision={activeRevision} isMuted={isMuted} toggleMute={toggleMute} pendingSyncCount={pendingSyncCount} onSync={handleSync} />
      <main className="rvi-main flex-1 max-w-[1500px] w-full mx-auto p-3 sm:p-5 lg:p-6">
        {setupStep === 1 && (
          <CameraCalibrationView
            devices={camera.devices}
            selectedDeviceId={camera.selectedDeviceId}
            setSelectedDeviceId={camera.setSelectedDeviceId}
            sourceMode={cameraSourceMode}
            setSourceMode={setCameraSourceMode}
            cameraState={camera.cameraState}
            remotePeerId={remotePeerId}
            remoteStatus={remoteStatus}
            phoneCameraUrl={phoneCameraUrl}
            videoRef={camera.videoRef}
            fps={camera.fps}
            videoDimensions={camera.videoDimensions}
            captureFrame={camera.captureFrame}
            onNextSetup={handleNextCameraSetup}
            onSwitchToStandSimulator={() => camera.enableVirtualMode('PERFECT_PASS')}
          />
        )}

        {setupStep === 2 && (
          <MasterManager
            masters={masters}
            activeMaster={activeMaster}
            activeRevision={activeRevision}
            onSelectMaster={handleSelectMaster}
            onRefreshMasters={loadMasters}
            onOpenSetupModal={handleOpenSetupModal}
            onCreateNewMaster={handleCreateNewMaster}
            onBackSetup={handleBackToCameraSetup}
            onContinueSetup={handleNextMasterSetup}
          />
        )}

        {setupStep === 3 && (
          <section className="space-y-5">
            <div className="rounded-2xl border border-cyan-500/30 bg-slate-950 p-5">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400">Setup 03 / 05</div>
              <h1 className="mt-1 text-xl font-bold text-white">SAVE CONFIGURATION + VALIDATE SETUP</h1>
              <p className="mt-1 text-xs font-mono text-slate-500">Validation Center — every required item is shown explicitly as PASS or INVALID before operation is unlocked.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">Device / Camera</div>
                <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                  <span className="text-sm text-white">Camera stream</span>
                  <span className={cameraReady ? "text-emerald-300 text-xs font-bold" : "text-red-300 text-xs font-bold"}>{cameraReady ? 'READY' : 'NOT READY'}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">Master Part</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                    <span className="text-sm text-white truncate">{activeMaster?.productCode || 'No master selected'}</span>
                    <span className={masterReady ? "text-emerald-300 text-xs font-bold" : "text-red-300 text-xs font-bold"}>{masterReady ? 'VALID' : 'INVALID'}</span>
                  </div>
                  <div className="space-y-1">
                    {masterValidationChecks.map((check) => (
                      <div key={check.label} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-[10px] font-mono">
                          <span className={check.valid ? 'text-slate-400' : 'text-red-300'}>{check.label}</span>
                          <span className={check.valid ? 'text-emerald-300' : 'text-rose-300'}>{check.valid ? 'PASS' : 'INVALID'}</span>
                        </div>
                        {!check.valid && <div className="pl-1 text-[10px] font-mono text-rose-200">→ {check.error}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {setupValidationAttempted && (!cameraReady || !masterReady) && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4">
                <div className="text-sm font-black text-rose-200">SETUP VALIDATION — INVALID</div>
                <div className="mt-1 text-xs text-rose-200/80">
                  {[
                    !cameraReady ? 'Camera is NOT READY.' : null,
                    !activeMaster ? 'No master part is selected.' : null,
                    ...masterValidationChecks.filter((check) => !check.valid).map((check) => check.label + ': ' + check.error),
                  ].filter(Boolean).map((message, index) => (
                    <div key={String(message) + index} className="mt-1">• {message}</div>
                  ))}
                </div>
                <button type="button" onClick={handleBackToMasterSetup} className="mt-3 px-4 py-2 rounded-xl border border-rose-500/30 bg-rose-950/30 text-rose-200 text-xs font-bold hover:bg-rose-950/50">
                  FIX MASTER CONFIGURATION
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <button type="button" onClick={handleBackToMasterSetup} className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold hover:text-white">← BACK: MASTER PART</button>
              <button
                type="button"
                onClick={handleSaveConfiguration}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400"
              >
                SAVE CONFIGURATION + VALIDATE
              </button>
            </div>
          </section>
        )}

        {setupStep === 4 && (
          <section className="space-y-5">
            <div className="rounded-2xl border border-emerald-500/30 bg-slate-950 p-6 text-center">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">Setup 04 / 05</div>
              <h1 className="mt-2 text-2xl font-black text-white">SETUP VALIDATED ✓</h1>
              <p className="mt-2 text-xs font-mono text-slate-400">All prerequisites are valid. Configuration will lock only after START begins the operation session.</p>
            </div>
            <div className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div className="rounded-xl bg-slate-950 p-4"><div className="text-[10px] font-mono text-slate-500">CAMERA</div><div className="mt-1 font-bold text-emerald-300">READY</div></div>
                <div className="rounded-xl bg-slate-950 p-4"><div className="text-[10px] font-mono text-slate-500">MASTER</div><div className="mt-1 font-bold text-emerald-300">VALID</div></div>
                <div className="rounded-xl bg-slate-950 p-4"><div className="text-[10px] font-mono text-slate-500">CONFIG</div><div className="mt-1 font-bold text-cyan-300">READY</div></div>
              </div>
              <button type="button" onClick={handleStartSession} className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-slate-950 hover:bg-emerald-400">
                START
              </button>
              <button type="button" onClick={handleBackToMasterSetup} className="mt-3 w-full rounded-xl border border-slate-800 py-2.5 text-xs font-bold text-slate-400 hover:text-white">
                ← BACK TO CONFIGURATION
              </button>
            </div>
          </section>
        )}

        {setupStep === 5 && activeTab === 'INSPECTION' && (
          <LiveInspectionView videoRef={camera.videoRef} canvasRef={camera.canvasRef} cameraState={camera.cameraState} errorMessage={camera.errorMessage} fps={camera.fps} videoDimensions={camera.videoDimensions} state={pipeline.state} stabilizationProgress={pipeline.stabilizationProgress} motionDelta={pipeline.motionDelta} currentResult={pipeline.currentResult} latestAlignment={pipeline.latestAlignment} latestRoiResults={pipeline.latestRoiResults} latestExtraObjects={pipeline.latestExtraObjects} stats={pipeline.stats} liveMetrics={pipeline.liveMetrics} plcHandshake={pipeline.plcHandshake} plcSignals={pipeline.plcSignals} activeMaster={activeMaster} activeRevision={activeRevision} role={role} processingFps={processingFps} setProcessingFps={setProcessingFps} isVirtualMode={camera.isVirtualMode} virtualScenario={camera.virtualScenario} setVirtualScenario={camera.setVirtualScenario} enableVirtualMode={camera.enableVirtualMode} enablePhysicalCamera={camera.enablePhysicalCamera} onOpenHistory={() => setActiveTab('HISTORY')} onOpenPlcConfig={() => handleNavigate('SETTINGS')} onEndSession={handleEndSession} />)}
        {setupStep === 5 && activeTab === 'HISTORY' && <InspectionHistoryView onRefreshStats={loadMasters} />}
        {setupStep === 5 && activeTab === 'SETTINGS' && <SettingsView onNavigate={handleNavigate} onClose={() => setActiveTab('INSPECTION')} />}
        {setupStep === 5 && activeTab === 'MASTERS' && <MasterManager masters={masters} activeMaster={activeMaster} activeRevision={activeRevision} onSelectMaster={handleSelectMaster} onRefreshMasters={loadMasters} onOpenSetupModal={handleOpenSetupModal} onCreateNewMaster={handleCreateNewMaster} onBackSetup={handleBackToCameraSetup} onContinueSetup={handleNextMasterSetup} />}
        {setupStep === 5 && activeTab === 'PLC_SETUP' && <PLCConfigurationView />}
        {setupStep === 5 && activeTab === 'DIAGNOSTICS' && <DiagnosticsModal metrics={pipeline.liveMetrics} />}
      </main>
      {setupStep === 2 && isSetupModalOpen && setupMaster && setupRevision && <MasterSetupModal master={setupMaster} revision={setupRevision} isOpen={isSetupModalOpen} onClose={() => setIsSetupModalOpen(false)} onSaved={loadMasters} />}
    </div>
  );
}
