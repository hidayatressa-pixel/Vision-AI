/**
 * Realtime Vision Inspection System
 * Manufacturing zero-touch automated visual inspection platform.
 */
import React, { useEffect, useState } from 'react';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('INSPECTION');
  const [role] = useState<UserRole>('OPERATOR');
  const [isMuted, setIsMuted] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [masters, setMasters] = useState<MasterProduct[]>([]);
  const [activeMaster, setActiveMaster] = useState<MasterProduct | null>(null);
  const [activeRevision, setActiveRevision] = useState<MasterRevision | null>(null);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [setupMaster, setSetupMaster] = useState<MasterProduct | null>(null);
  const [setupRevision, setSetupRevision] = useState<MasterRevision | null>(null);

  const cameraOptions = React.useMemo(() => ({ preferredFacingMode: 'environment' as const, preferredResolution: { width: 800, height: 600 } }), []);
  const camera = useCamera(cameraOptions);
  const pipeline = useInspectionPipeline({ activeMaster, activeRevision, captureFrame: camera.captureFrame, cameraState: camera.cameraState, fps: camera.fps });

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
    setActiveMaster(master);
    const revId = revisionId || master.activeRevisionId;
    setActiveRevision(master.revisions.find((r) => r.id === revId) || master.revisions[0]);
    pipeline.resetPipeline();
  };

  const handleOpenSetupModal = (master: MasterProduct, revision: MasterRevision) => {
    setSetupMaster(master); setSetupRevision(revision); setIsSetupModalOpen(true);
  };

  const handleCreateNewMaster = async () => {
    const newIdx = masters.length + 1;
    const now = new Date().toISOString();
    const productId = `prd-${newIdx}-${Date.now()}`;
    const revisionId = `rev-01-${Date.now()}`;
    const baseRevision = SEED_PRODUCT_A.revisions[0];
    const newProduct: MasterProduct = {
      id: productId,
      productCode: `PRD-CHASSIS-${String(newIdx).padStart(2, '0')}`,
      productName: `Product ${String.fromCharCode(65 + newIdx - 1)} · 6-Screw Module`,
      description: 'New master cloned from the six-screw baseline.', activeRevisionId: revisionId, isActive: true,
      createdAt: now, updatedAt: now, createdBy: 'System Engineer',
      revisions: [{ ...baseRevision, id: revisionId, masterId: productId, revisionCode: 'REV-01', revisionNote: 'Initial production baseline', createdAt: now, updatedAt: now }],
    };
    await dbService.saveMaster(newProduct); await loadMasters(); handleSelectMaster(newProduct, revisionId);
  };

  const handleSync = async () => { await dbService.flushSyncQueue(); setPendingSyncCount(await dbService.getPendingSyncCount()); };
  const toggleMute = () => { const next = !isMuted; setIsMuted(next); soundService.setMuted(next); };

  return (
    <div className="min-h-screen rvi-app text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} role={role} setRole={() => undefined} activeMaster={activeMaster} activeRevision={activeRevision} isMuted={isMuted} toggleMute={toggleMute} pendingSyncCount={pendingSyncCount} onSync={handleSync} />
      <main className="rvi-main flex-1 max-w-[1500px] w-full mx-auto p-3 sm:p-5 lg:p-6">
        {activeTab === 'INSPECTION' && <LiveInspectionView videoRef={camera.videoRef} canvasRef={camera.canvasRef} cameraState={camera.cameraState} errorMessage={camera.errorMessage} fps={camera.fps} videoDimensions={camera.videoDimensions} state={pipeline.state} stabilizationProgress={pipeline.stabilizationProgress} motionDelta={pipeline.motionDelta} currentResult={pipeline.currentResult} latestAlignment={pipeline.latestAlignment} latestRoiResults={pipeline.latestRoiResults} latestExtraObjects={pipeline.latestExtraObjects} stats={pipeline.stats} liveMetrics={pipeline.liveMetrics} plcHandshake={pipeline.plcHandshake} plcSignals={pipeline.plcSignals} activeMaster={activeMaster} activeRevision={activeRevision} role={role} isVirtualMode={camera.isVirtualMode} virtualScenario={camera.virtualScenario} setVirtualScenario={camera.setVirtualScenario} enableVirtualMode={camera.enableVirtualMode} enablePhysicalCamera={camera.enablePhysicalCamera} calibrateBackground={pipeline.calibrateBackground} onOpenHistory={() => setActiveTab('HISTORY')} onOpenPlcConfig={() => setActiveTab('SETTINGS')} />}
        {activeTab === 'HISTORY' && <InspectionHistoryView onRefreshStats={loadMasters} />}
        {activeTab === 'SETTINGS' && <SettingsView onNavigate={setActiveTab} onClose={() => setActiveTab('INSPECTION')} />}
        {activeTab === 'MASTERS' && <MasterManager masters={masters} activeMaster={activeMaster} activeRevision={activeRevision} onSelectMaster={handleSelectMaster} onRefreshMasters={loadMasters} onOpenSetupModal={handleOpenSetupModal} onCreateNewMaster={handleCreateNewMaster} />}
        {activeTab === 'CAMERA_SETUP' && <CameraCalibrationView devices={camera.devices} selectedDeviceId={camera.selectedDeviceId} setSelectedDeviceId={camera.setSelectedDeviceId} cameraState={camera.cameraState} fps={camera.fps} videoDimensions={camera.videoDimensions} captureFrame={camera.captureFrame} calibrateBackground={pipeline.calibrateBackground} onSwitchToStandSimulator={() => camera.enableVirtualMode('PERFECT_PASS')} />}
        {activeTab === 'PLC_SETUP' && <PLCConfigurationView />}
        {activeTab === 'DIAGNOSTICS' && <DiagnosticsModal metrics={pipeline.liveMetrics} />}
      </main>
      {isSetupModalOpen && setupMaster && setupRevision && <MasterSetupModal master={setupMaster} revision={setupRevision} isOpen={isSetupModalOpen} onClose={() => setIsSetupModalOpen(false)} onSaved={loadMasters} />}
    </div>
  );
}
