/**
 * Industrial Top Navigation Bar
 */

import React from 'react';
import {
  ScanLine,
  Boxes,
  ClipboardCheck,
  Gauge,
  Volume2,
  VolumeX,
  Shield,
  Wifi,
  RefreshCw,
  Camera,
  Cable,
} from 'lucide-react';
import { MasterProduct, MasterRevision } from '../types/master';
import { getRuntimeIdentity } from '../services/runtimeConfig';

export type ActiveTab = 'INSPECTION' | 'MASTERS' | 'CAMERA_SETUP' | 'PLC_SETUP' | 'HISTORY' | 'DIAGNOSTICS';
export type UserRole = 'OPERATOR' | 'ENGINEER';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  activeMaster: MasterProduct | null;
  activeRevision: MasterRevision | null;
  isMuted: boolean;
  toggleMute: () => void;
  pendingSyncCount: number;
  onSync: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  role,
  setRole,
  activeMaster,
  activeRevision,
  isMuted,
  toggleMute,
  pendingSyncCount,
  onSync,
}) => {
  const identity = getRuntimeIdentity();

  return (
    <header className="rvi-topbar text-slate-100 select-none">
      <div className="rvi-topbar-inner max-w-[1500px] mx-auto px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-4">
        {/* Brand & Product Indicator */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="rvi-brand-mark shrink-0">
            <ScanLine className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-semibold text-sm sm:text-[15px] tracking-[0.01em] text-white truncate">
                VISION STATION
              </span>
              <span className="hidden xl:inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] px-2 py-1 rounded border border-slate-700 bg-slate-900 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> ONLINE
              </span>
            </div>
            {activeMaster && activeRevision ? (
              <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate">
                <span className="text-cyan-300 font-medium truncate">{activeMaster.productCode}</span>
                <span className="text-slate-600">/</span>
                <span className="font-mono text-slate-300">{activeRevision.revisionCode}</span>
                <span className="text-slate-600">/</span>
                <span>{activeRevision.expectedObjectCount} inspection points</span>
                <span className="text-slate-600">/</span>
                <span className="font-mono text-slate-500">{identity.stationId}</span>
              </div>
            ) : (
              <div className="text-[11px] text-amber-400">No active master</div>
            )}
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="rvi-nav hidden lg:flex items-center gap-0.5">
          <button
            onClick={() => setActiveTab('INSPECTION')}
            className={`rvi-nav-item flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              activeTab === 'INSPECTION'
                ? 'is-active text-cyan-300 font-semibold'
                : 'text-slate-400'
            }`}
          >
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">Inspection</span>
          </button>

          {role === 'ENGINEER' && (
            <>
              <button
                onClick={() => setActiveTab('MASTERS')}
                className={`rvi-nav-item flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeTab === 'MASTERS'
                    ? 'is-active text-cyan-300 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                <Boxes className="w-4 h-4" />
                <span className="hidden sm:inline">Masters</span>
              </button>

              <button
                onClick={() => setActiveTab('CAMERA_SETUP')}
                className={`rvi-nav-item flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeTab === 'CAMERA_SETUP'
                    ? 'is-active text-cyan-300 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Camera</span>
              </button>

              <button
                onClick={() => setActiveTab('PLC_SETUP')}
                className={`rvi-nav-item flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeTab === 'PLC_SETUP'
                    ? 'is-active text-cyan-300 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                <Cable className="w-4 h-4" />
                <span className="hidden sm:inline">PLC</span>
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`rvi-nav-item flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              activeTab === 'HISTORY'
                ? 'is-active text-cyan-300 font-semibold'
                : 'text-slate-400'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </button>

          <button
            onClick={() => setActiveTab('DIAGNOSTICS')}
            className={`rvi-nav-item flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              activeTab === 'DIAGNOSTICS'
                ? 'is-active text-cyan-300 font-semibold'
                : 'text-slate-400'
            }`}
          >
            <Gauge className="w-4 h-4" />
            <span className="hidden sm:inline">Diagnostics</span>
          </button>
        </nav>

        {/* Right Tools & Role Toggle */}
        <div className="flex items-center gap-2">
          {/* Audio Mute */}
          <button
            onClick={toggleMute}
            title={isMuted ? 'Unmute Audio Feedback' : 'Mute Audio Feedback'}
            className="rvi-toolbar-pill p-2 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Sync Queue */}
          <button
            onClick={onSync}
            title={pendingSyncCount > 0 ? `${pendingSyncCount} inspections queued locally` : 'All inspections saved & synced'}
            className="rvi-toolbar-pill flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {pendingSyncCount > 0 ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="font-mono text-amber-400">{pendingSyncCount}</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline text-slate-400 font-mono text-[11px]">Synced</span>
              </>
            )}
          </button>

          {/* Role Switcher */}
          <div className="flex items-center bg-slate-950/70 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setRole('OPERATOR')}
              className={`px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                role === 'OPERATOR' ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Operator
            </button>
            <button
              onClick={() => setRole('ENGINEER')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                role === 'ENGINEER' ? 'bg-slate-800 text-amber-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3 h-3" />
              Engineer
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
