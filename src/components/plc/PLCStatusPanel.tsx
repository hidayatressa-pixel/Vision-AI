/**
 * Engineering PLC Status & Interlock Panel
 * Section 46: Displays live signals, handshake state, heartbeat watchdog,
 * and authoritative machine process permit / interlock status.
 */

import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  Radio,
  Wifi,
  WifiOff,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
} from 'lucide-react';
import { plcService } from '../../services/plc/plcService';
import { SimulatedPLCAdapter } from '../../services/plc/simulatedPlcAdapter';
import { PLCHandshakeState, PLCLiveSignals } from '../../types/plc';

interface PLCStatusPanelProps {
  plcHandshake: PLCHandshakeState;
  plcSignals: PLCLiveSignals;
  onOpenSettings?: () => void;
}

export const PLCStatusPanel: React.FC<PLCStatusPanelProps> = ({
  plcHandshake,
  plcSignals,
  onOpenSettings,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [showTimeline, setShowTimeline] = useState<boolean>(false);

  const isConnected = plcHandshake.connectionStatus === 'CONNECTED' || plcHandshake.connectionStatus === 'SIMULATING';
  const isPermitted = plcHandshake.interlockState === 'PERMITTED' && plcSignals.processPermit;

  // Helpers for quick simulated input toggles if using simulation adapter
  const adapter = plcService.getAdapter();
  const isSimulated = adapter.protocol === 'SIMULATION';

  const toggleSimPartPresent = () => {
    if (isSimulated) {
      (adapter as SimulatedPLCAdapter).setSimulatedPlcInputs({
        partPresent: !plcSignals.partPresent,
      });
    }
  };

  const toggleSimMachineReady = () => {
    if (isSimulated) {
      (adapter as SimulatedPLCAdapter).setSimulatedPlcInputs({
        machineReady: !plcSignals.machineReady,
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all">
      {/* Header Banner */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
              isPermitted
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : plcHandshake.interlockState === 'COMMUNICATION_FAULT'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}
          >
            {isPermitted ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-white">PLC INTERLOCK & PROCESS GATE</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                  isPermitted
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                    : 'bg-red-950 text-red-300 border border-red-600'
                }`}
              >
                {isPermitted ? 'PROCESS PERMITTED' : 'PROCESS BLOCKED'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
              <span>Status:</span>
              <span
                className={`font-semibold ${
                  isConnected ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {plcHandshake.connectionStatus}
              </span>
              <span>·</span>
              <span>Watchdog:</span>
              <span className={plcHandshake.heartbeatHealthy ? 'text-emerald-400' : 'text-red-400 animate-pulse'}>
                {plcHandshake.heartbeatHealthy ? 'NORMAL' : 'FAULT / TIMEOUT'}
              </span>
              {plcHandshake.roundTripLatencyMs > 0 && (
                <>
                  <span>·</span>
                  <span className="text-cyan-400">ACK {plcHandshake.roundTripLatencyMs}ms</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-mono px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700"
            >
              Config
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Signal Matrix */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Signal Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs font-mono">
            {/* 1. PLC Ready */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">PLC READY</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${plcSignals.plcReady ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className={plcSignals.plcReady ? 'text-white font-bold' : 'text-slate-500'}>
                  {plcSignals.plcReady ? 'YES' : 'NO'}
                </span>
              </div>
            </div>

            {/* 2. Machine Ready */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400">MACHINE READY</span>
                {isSimulated && (
                  <button
                    onClick={toggleSimMachineReady}
                    title="Toggle simulated machine ready state"
                    className="text-[9px] text-cyan-400 hover:underline"
                  >
                    toggle
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${plcSignals.machineReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={plcSignals.machineReady ? 'text-white font-bold' : 'text-amber-400'}>
                  {plcSignals.machineReady ? 'READY' : 'BUSY/FAULT'}
                </span>
              </div>
            </div>

            {/* 3. Part Present (Trigger) */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400">PART PRESENT</span>
                {isSimulated && (
                  <button
                    onClick={toggleSimPartPresent}
                    title="Toggle simulated part sensor"
                    className="text-[9px] text-cyan-400 hover:underline"
                  >
                    toggle
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${plcSignals.partPresent ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className={plcSignals.partPresent ? 'text-cyan-300 font-bold' : 'text-slate-500'}>
                  {plcSignals.partPresent ? 'PRESENT' : 'EMPTY'}
                </span>
              </div>
            </div>

            {/* 4. Vision Ready / Busy */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">VISION STATUS</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${plcSignals.visionBusy ? 'bg-amber-400 animate-spin' : 'bg-emerald-400'}`} />
                <span className="text-white font-bold">
                  {plcSignals.visionBusy ? 'INSPECTING' : 'READY'}
                </span>
              </div>
            </div>

            {/* 5. Last Result Sent */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">LAST RESULT</span>
              <div className="flex items-center gap-1.5">
                {plcHandshake.lastResultSent === 'OK' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : plcHandshake.lastResultSent === 'NG' ? (
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                ) : plcHandshake.lastResultSent === 'ERROR' ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                )}
                <span
                  className={
                    plcHandshake.lastResultSent === 'OK'
                      ? 'text-emerald-400 font-bold'
                      : plcHandshake.lastResultSent === 'NG'
                      ? 'text-red-400 font-bold'
                      : plcHandshake.lastResultSent === 'ERROR'
                      ? 'text-amber-400 font-bold'
                      : 'text-slate-500'
                  }
                >
                  {plcHandshake.lastResultSent || 'NONE'}
                </span>
              </div>
            </div>

            {/* 6. PLC Acknowledge (ACK_RESULT) */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">PLC ACK</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    plcSignals.ackResult
                      ? 'bg-emerald-400'
                      : plcHandshake.ackPending
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-slate-600'
                  }`}
                />
                <span
                  className={
                    plcSignals.ackResult
                      ? 'text-emerald-400 font-bold'
                      : plcHandshake.ackPending
                      ? 'text-amber-300'
                      : 'text-slate-500'
                  }
                >
                  {plcSignals.ackResult ? 'RECEIVED' : plcHandshake.ackPending ? 'WAITING...' : 'IDLE'}
                </span>
              </div>
            </div>
          </div>

          {/* Toggleable Cycle Event Timeline (Section 55) */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setShowTimeline(!showTimeline)}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Cycle Handshake Timeline ({plcHandshake.activeCycleTimeline.length} events)</span>
                {showTimeline ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <span className="text-[10px] font-mono text-slate-500">
                Seq #{plcHandshake.lastSequenceNumber}
              </span>
            </div>

            {showTimeline && (
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
                {plcHandshake.activeCycleTimeline.length > 0 ? (
                  plcHandshake.activeCycleTimeline.map((ev, idx) => (
                    <div key={idx} className="flex items-baseline justify-between text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400 font-bold">+{ev.elapsedMs}ms</span>
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                            ev.source === 'PLC'
                              ? 'bg-blue-950 text-blue-300'
                              : ev.source === 'VISION'
                              ? 'bg-purple-950 text-purple-300'
                              : 'bg-emerald-950 text-emerald-300'
                          }`}
                        >
                          {ev.source}
                        </span>
                        <span className="text-slate-200">{ev.eventName}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 truncate max-w-xs">{ev.description}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-600 text-center py-2">No active cycle events yet.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
