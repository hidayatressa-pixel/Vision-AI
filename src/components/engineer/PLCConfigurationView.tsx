/**
 * Engineering PLC Configuration & Interlock Testing Sandbox
 * Sections 47, 56, 57: Configurable protocols (Modbus, OPC UA, Ethernet/IP, Siemens S7),
 * tag address mapping, timeouts, watchdog parameters, and fault injection simulator.
 */

import React, { useState } from 'react';
import {
  Cpu,
  Save,
  Radio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  Sliders,
  ShieldAlert,
  Lock,
  Unlock,
  Server,
  Zap,
} from 'lucide-react';
import { plcService } from '../../services/plc/plcService';
import { SimulatedPLCAdapter } from '../../services/plc/simulatedPlcAdapter';
import { PLCConfiguration, PLCProtocol, PLCTagMapping, PLCTriggerMode } from '../../types/plc';
import { getRuntimeIdentity, saveRuntimeIdentity } from '../../services/runtimeConfig';

interface PLCConfigurationViewProps {
  onConfigSaved?: () => void;
}

export const PLCConfigurationView: React.FC<PLCConfigurationViewProps> = ({ onConfigSaved }) => {
  const [config, setConfig] = useState<PLCConfiguration>(plcService.getConfig());
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs: number; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState(getRuntimeIdentity());

  // Active adapter fault injection options for testing
  const adapter = plcService.getAdapter();
  const isSimulation = config.protocol === 'SIMULATION';
  const simAdapter = isSimulation ? (adapter as SimulatedPLCAdapter) : null;

  const [faults, setFaults] = useState({
    dropConnection: simAdapter?.injectFaults.dropConnection || false,
    ignoreAck: simAdapter?.injectFaults.ignoreAck || false,
    machineNotReady: simAdapter?.injectFaults.machineNotReady || false,
    heartbeatTimeout: simAdapter?.injectFaults.heartbeatTimeout || false,
  });

  const handleToggleFault = (key: keyof typeof faults) => {
    const nextVal = !faults[key];
    const newFaults = { ...faults, [key]: nextVal };
    setFaults(newFaults);

    if (simAdapter) {
      simAdapter.injectFaults[key] = nextVal;
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await plcService.testConnection();
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    plcService.saveConfig(config);
    saveRuntimeIdentity(identity);
    setSaveMessage('PLC configuration and station identity saved.');
    if (onConfigSaved) onConfigSaved();
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleTagChange = (field: keyof PLCTagMapping, val: string) => {
    setConfig((prev) => ({
      ...prev,
      tags: {
        ...prev.tags,
        [field]: val,
      },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400">
            <Cpu className="w-5 h-5" />
            <h2 className="text-xl font-bold text-white">PLC Integration & Industrial Interlock</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Configure Modbus TCP, OPC UA, EtherNet/IP, Siemens S7, watchdog heartbeat, and process interlock signals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold"
          >
            <Zap className={`w-4 h-4 text-cyan-400 ${isTesting ? 'animate-spin' : ''}`} />
            <span>Test Connection</span>
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="bg-emerald-950/80 border border-emerald-500 rounded-xl p-3 text-xs font-mono text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{saveMessage}</span>
        </div>
      )}

      {testResult && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-mono flex items-center justify-between ${
            testResult.success
              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
              : 'bg-red-950/60 border-red-500 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
            <span>{testResult.message}</span>
          </div>
          <span className="font-bold text-cyan-400">Latency: {testResult.latencyMs} ms</span>
        </div>
      )}

      {/* Main Form Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Protocol & Connection Parameters */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Protocol & Network Endpoint</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 pb-1">
              <div>
                <label className="text-[11px] font-mono text-slate-300 block mb-1">Station ID</label>
                <input
                  value={identity.stationId}
                  onChange={(e) => setIdentity({ ...identity, stationId: e.target.value })}
                  className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2"
                  placeholder="STAND-CAM-01"
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-300 block mb-1">Operator ID</label>
                <input
                  value={identity.operatorId}
                  onChange={(e) => setIdentity({ ...identity, operatorId: e.target.value })}
                  className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2"
                  placeholder="OP-001"
                />
              </div>
            </div>

            {config.protocol !== 'SIMULATION' && (
              <div>
                <label className="text-[11px] font-mono text-slate-300 block mb-1">PLC Gateway URL</label>
                <input
                  value={config.gatewayBaseUrl || '/api/plc'}
                  onChange={(e) => setConfig({ ...config, gatewayBaseUrl: e.target.value })}
                  className="w-full bg-slate-950 text-cyan-300 font-mono text-xs border border-slate-700 rounded-lg p-2"
                  placeholder="/api/plc"
                />
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  Browser-to-PLC communication must use an approved edge gateway; no fake browser-side ACKs are accepted.
                </p>
              </div>
            )}

            {/* Protocol Selector */}
            <div>
              <label className="text-[11px] font-mono text-slate-300 block mb-1.5">Communication Protocol</label>
              <select
                value={config.protocol}
                onChange={(e) => setConfig({ ...config, protocol: e.target.value as PLCProtocol })}
                className="w-full bg-slate-950 text-cyan-300 font-mono text-xs border border-slate-700 rounded-lg p-2.5 focus:border-cyan-500"
              >
                <option value="SIMULATION">🛠 SIMULATION MODE (Testing & Dry-Run)</option>
                <option value="MODBUS_TCP">🔌 Modbus TCP (Port 502)</option>
                <option value="OPC_UA">🌐 OPC UA (Binary / TCP)</option>
                <option value="ETHERNET_IP">🏭 EtherNet/IP (CIP / Allen-Bradley)</option>
                <option value="SIEMENS_S7">⚙ Siemens S7 (ISO-on-TCP Port 102)</option>
                <option value="REST_GATEWAY">📡 Industrial REST/WebSocket Gateway</option>
              </select>
            </div>

            {config.protocol === 'SIMULATION' && (
              <div className="p-3 bg-cyan-950/40 border border-cyan-500/40 rounded-xl text-[11px] font-mono text-cyan-200">
                <span className="font-bold block mb-0.5">SIMULATION MODE ACTIVE</span>
                Simulates real PLC scan cycles, auto-acknowledges results, and handles process permits without physical hardware.
              </div>
            )}

            {/* IP Address & Port */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-300 block mb-1">PLC IP Address</label>
                <input
                  type="text"
                  value={config.ipAddress}
                  onChange={(e) => setConfig({ ...config, ipAddress: e.target.value })}
                  placeholder="192.168.1.100"
                  className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2 focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-300 block mb-1">Port</label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 502 })}
                  className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2 focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Siemens Rack / Slot */}
            {config.protocol === 'SIEMENS_S7' && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-[11px] font-mono text-slate-300 block mb-1">Rack</label>
                  <input
                    type="number"
                    value={config.rack ?? 0}
                    onChange={(e) => setConfig({ ...config, rack: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-300 block mb-1">Slot</label>
                  <input
                    type="number"
                    value={config.slot ?? 1}
                    onChange={(e) => setConfig({ ...config, slot: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-950 text-white font-mono text-xs border border-slate-700 rounded-lg p-2"
                  />
                </div>
              </div>
            )}

            {/* Trigger Mode Configuration (Section 43 & 44) */}
            <div className="pt-2 border-t border-slate-800">
              <label className="text-[11px] font-mono text-slate-300 block mb-1.5">Inspection Trigger Mode</label>
              <div className="space-y-1.5 font-mono text-xs">
                {[
                  {
                    id: 'AUTO_CAMERA',
                    label: 'AUTO_CAMERA (Vision automatic presence detection)',
                    desc: 'Smartphone camera automatically triggers when workpiece enters detection zone.',
                  },
                  {
                    id: 'PLC',
                    label: 'PLC (Physical sensor / PLC trigger bit)',
                    desc: 'PLC asserts PART_PRESENT when photo-eye or proximity sensor triggers.',
                  },
                  {
                    id: 'HYBRID',
                    label: 'HYBRID (PLC Sensor + Camera Visual Confirmation)',
                    desc: 'Requires BOTH physical sensor AND visual verification before inspecting.',
                  },
                ].map((mode) => (
                  <label
                    key={mode.id}
                    className={`block p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      config.triggerMode === mode.id
                        ? 'bg-slate-800 border-cyan-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="triggerMode"
                        value={mode.id}
                        checked={config.triggerMode === mode.id}
                        onChange={() => setConfig({ ...config, triggerMode: mode.id as PLCTriggerMode })}
                        className="accent-cyan-500"
                      />
                      <span className="font-bold text-xs">{mode.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 ml-5">{mode.desc}</p>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Fault Injection Sandbox (Section 56) */}
          {isSimulation && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                <span>Simulation Fault Injection Sandbox</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Inject production faults to verify that the PLC correctly blocks the machine.
              </p>

              <div className="space-y-2 text-xs font-mono">
                <button
                  onClick={() => handleToggleFault('dropConnection')}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                    faults.dropConnection
                      ? 'bg-red-950 border-red-500 text-red-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>Drop PLC Connection (Comm Loss)</span>
                  <span className="font-bold">{faults.dropConnection ? 'ACTIVE' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => handleToggleFault('ignoreAck')}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                    faults.ignoreAck
                      ? 'bg-red-950 border-red-500 text-red-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>Simulate Missing PLC ACK (Timeout)</span>
                  <span className="font-bold">{faults.ignoreAck ? 'ACTIVE' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => handleToggleFault('machineNotReady')}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                    faults.machineNotReady
                      ? 'bg-amber-950 border-amber-500 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>Simulate Machine Fault / Not Ready</span>
                  <span className="font-bold">{faults.machineNotReady ? 'ACTIVE' : 'OFF'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Center: Timing, Watchdogs, & Fail-Safe Parameters */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>Watchdogs & Handshake Timing</span>
            </h3>

            {/* Heartbeat Interval */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-300">Watchdog Heartbeat Rate:</span>
                <span className="text-cyan-400 font-bold">{config.heartbeatIntervalMs} ms</span>
              </div>
              <input
                type="range"
                min="200"
                max="2000"
                step="100"
                value={config.heartbeatIntervalMs}
                onChange={(e) => setConfig({ ...config, heartbeatIntervalMs: parseInt(e.target.value, 10) })}
                className="w-full accent-cyan-500"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Frequency at which VISION_HEARTBEAT toggles to prove browser liveness.
              </p>
            </div>

            {/* Heartbeat Timeout */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-300">Heartbeat Watchdog Timeout:</span>
                <span className="text-cyan-400 font-bold">{config.heartbeatTimeoutMs} ms</span>
              </div>
              <input
                type="range"
                min="500"
                max="5000"
                step="250"
                value={config.heartbeatTimeoutMs}
                onChange={(e) => setConfig({ ...config, heartbeatTimeoutMs: parseInt(e.target.value, 10) })}
                className="w-full accent-cyan-500"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                If no heartbeat response within this timeout, PLC immediately blocks process.
              </p>
            </div>

            {/* ACK Timeout */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-300">Result ACK Timeout:</span>
                <span className="text-cyan-400 font-bold">{config.ackTimeoutMs} ms</span>
              </div>
              <input
                type="range"
                min="300"
                max="3000"
                step="100"
                value={config.ackTimeoutMs}
                onChange={(e) => setConfig({ ...config, ackTimeoutMs: parseInt(e.target.value, 10) })}
                className="w-full accent-cyan-500"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Maximum time allowed for PLC to acknowledge receipt of inspection result.
              </p>
            </div>

            {/* Max Inspection Timeout */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-300">Max Inspection Timeout:</span>
                <span className="text-cyan-400 font-bold">{config.maxInspectionTimeoutMs} ms</span>
              </div>
              <input
                type="range"
                min="500"
                max="5000"
                step="250"
                value={config.maxInspectionTimeoutMs}
                onChange={(e) => setConfig({ ...config, maxInspectionTimeoutMs: parseInt(e.target.value, 10) })}
                className="w-full accent-cyan-500"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                If vision inference exceeds this limit, triggers INSPECTION_ERROR (never OK).
              </p>
            </div>

            {/* Result Hold Time */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-300">Result Signal Hold Time:</span>
                <span className="text-cyan-400 font-bold">{config.resultHoldTimeMs} ms</span>
              </div>
              <input
                type="range"
                min="200"
                max="2000"
                step="100"
                value={config.resultHoldTimeMs}
                onChange={(e) => setConfig({ ...config, resultHoldTimeMs: parseInt(e.target.value, 10) })}
                className="w-full accent-cyan-500"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Duration outputs are held on PLC inputs before clearing.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Configurable PLC Tag / Address Mapping (Section 37) */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                PLC Tag / Address Mapping
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Fully Configurable</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Customizable address mapping for Modbus Coils/Registers, OPC UA NodeIds, or S7 DataBlocks.
            </p>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 text-xs font-mono">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block mt-2">
                Inputs from PLC
              </span>

              {[
                { key: 'plcReady', label: 'PLC_READY' },
                { key: 'machineReady', label: 'MACHINE_READY' },
                { key: 'partPresent', label: 'PART_PRESENT' },
                { key: 'ackResult', label: 'ACK_RESULT' },
                { key: 'resetRequest', label: 'RESET_REQUEST' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-300 font-semibold">{label}</span>
                  <input
                    type="text"
                    value={config.tags[key as keyof PLCTagMapping]}
                    onChange={(e) => handleTagChange(key as keyof PLCTagMapping, e.target.value)}
                    className="w-36 bg-slate-900 text-cyan-300 text-[11px] font-mono px-2 py-1 rounded border border-slate-700 text-right"
                  />
                </div>
              ))}

              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mt-4">
                Outputs to PLC
              </span>

              {[
                { key: 'visionReady', label: 'VISION_READY' },
                { key: 'visionBusy', label: 'VISION_BUSY' },
                { key: 'inspectionComplete', label: 'INSPECTION_COMPLETE' },
                { key: 'inspectionOk', label: 'INSPECTION_OK' },
                { key: 'inspectionNg', label: 'INSPECTION_NG' },
                { key: 'inspectionError', label: 'INSPECTION_ERROR' },
                { key: 'visionHeartbeat', label: 'VISION_HEARTBEAT' },
                { key: 'alignmentOk', label: 'ALIGNMENT_OK' },
                { key: 'processPermit', label: 'PROCESS_PERMIT' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-300 font-semibold">{label}</span>
                  <input
                    type="text"
                    value={config.tags[key as keyof PLCTagMapping]}
                    onChange={(e) => handleTagChange(key as keyof PLCTagMapping, e.target.value)}
                    className="w-36 bg-slate-900 text-emerald-300 text-[11px] font-mono px-2 py-1 rounded border border-slate-700 text-right"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
