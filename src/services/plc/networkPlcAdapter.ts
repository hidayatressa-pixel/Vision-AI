import { PLCConfiguration, PLCInspectionPayload, PLCLiveSignals } from '../../types/plc';
import { PLCAdapter } from './plcAdapter';

/**
 * Physical PLC adapter through an industrial edge/gateway API.
 * Browser code never fabricates PLC connectivity or ACKs. A production
 * gateway must explicitly confirm every connection, read and write.
 */
export class NetworkPLCAdapter implements PLCAdapter {
  readonly protocol: string;
  private connected = false;
  private config: PLCConfiguration | null = null;
  private activeSignals: PLCLiveSignals = {
    plcReady: false, machineReady: false, partPresent: false, cycleActive: false,
    ackResult: false, resetRequest: false, interlockReset: false, heartbeatRequest: false,
    visionReady: false, visionBusy: false, inspectionComplete: false, inspectionOk: false,
    inspectionNg: false, inspectionError: false, visionHeartbeat: false,
    alignmentOk: false, partValid: false, processPermit: false,
  };

  constructor(protocol: string) { this.protocol = protocol; }
  public get isConnected(): boolean { return this.connected; }

  private baseUrl(): string {
    return (this.config?.gatewayBaseUrl || '/api/plc').replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.baseUrl() + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      signal: init?.signal || AbortSignal.timeout(this.config?.connectionTimeoutMs || 3000),
    });
    if (!response.ok) throw new Error('PLC gateway HTTP ' + response.status);
    return response.json() as Promise<T>;
  }

  public async connect(config: PLCConfiguration): Promise<boolean> {
    this.config = config;
    try {
      const result = await this.request<{ ok: boolean; signals?: PLCLiveSignals; message?: string }>('/connect', {
        method: 'POST',
        body: JSON.stringify({
          protocol: config.protocol, ipAddress: config.ipAddress, port: config.port,
          rack: config.rack, slot: config.slot, stationId: config.stationId, tags: config.tags,
        }),
      });
      if (!result.ok) throw new Error(result.message || 'PLC gateway rejected connection');
      this.connected = true;
      if (result.signals) this.activeSignals = { ...this.activeSignals, ...result.signals };
      return true;
    } catch {
      this.connected = false;
      this.activeSignals.processPermit = false;
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connected) {
      try { await this.request('/disconnect', { method: 'POST', body: JSON.stringify({}) }); } catch {}
    }
    this.connected = false;
    this.activeSignals.processPermit = false;
  }

  public async testConnection(config: PLCConfiguration): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const start = performance.now();
    try {
      const response = await fetch((config.gatewayBaseUrl || '/api/plc').replace(/\/$/, '') + '/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: config.protocol, ipAddress: config.ipAddress, port: config.port,
          rack: config.rack, slot: config.slot, stationId: config.stationId,
        }),
        signal: AbortSignal.timeout(config.connectionTimeoutMs || 3000),
      });
      const latencyMs = Math.round(performance.now() - start);
      if (!response.ok) return { success: false, latencyMs, message: 'PLC gateway returned HTTP ' + response.status };
      const result = await response.json() as { ok?: boolean; message?: string };
      return {
        success: result.ok === true,
        latencyMs,
        message: result.message || (result.ok ? 'PLC gateway reachable' : 'PLC gateway rejected connection'),
      };
    } catch (error) {
      return { success: false, latencyMs: Math.round(performance.now() - start), message: error instanceof Error ? error.message : 'PLC gateway unreachable' };
    }
  }

  public async readSignals(): Promise<PLCLiveSignals> {
    if (!this.connected) throw new Error('PLC disconnected');
    const result = await this.request<{ signals: PLCLiveSignals }>('/signals');
    this.activeSignals = { ...this.activeSignals, ...result.signals };
    return { ...this.activeSignals };
  }

  public async writeSignals(updates: Partial<PLCLiveSignals>): Promise<boolean> {
    if (!this.connected) return false;
    try {
      await this.request('/signals', { method: 'POST', body: JSON.stringify({ updates }) });
      Object.assign(this.activeSignals, updates);
      return true;
    } catch { return false; }
  }

  public async sendHeartbeat(beat: boolean): Promise<boolean> {
    if (!this.connected) return false;
    try {
      const result = await this.request<{ ok: boolean }>('/heartbeat', {
        method: 'POST', body: JSON.stringify({ beat }),
      });
      if (result.ok) this.activeSignals.visionHeartbeat = beat;
      return result.ok;
    } catch { return false; }
  }

  public async sendInspectionResult(payload: PLCInspectionPayload): Promise<boolean> {
    if (!this.connected) return false;
    try {
      const result = await this.request<{ ok: boolean; signals?: PLCLiveSignals }>('/inspection-result', {
        method: 'POST', body: JSON.stringify(payload),
      });
      if (!result.ok) return false;
      if (result.signals) this.activeSignals = { ...this.activeSignals, ...result.signals };
      return true;
    } catch { return false; }
  }

  public async waitForAck(timeoutMs: number): Promise<boolean> {
    if (!this.connected) return false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.readAck()) return true;
      } catch { return false; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }

  public async clearResultSignals(): Promise<void> {
    if (!this.connected) return;
    try { await this.request('/result-clear', { method: 'POST', body: JSON.stringify({}) }); } catch {}
    this.activeSignals.inspectionComplete = false;
    this.activeSignals.inspectionOk = false;
    this.activeSignals.inspectionNg = false;
    this.activeSignals.inspectionError = false;
    this.activeSignals.ackResult = false;
  }

  public async readMachineState(): Promise<{ plcReady: boolean; machineReady: boolean }> {
    const signals = await this.readSignals();
    return { plcReady: signals.plcReady, machineReady: signals.machineReady };
  }

  public async readPartTrigger(): Promise<boolean> { return (await this.readSignals()).partPresent; }
  public async readAck(): Promise<boolean> { return (await this.readSignals()).ackResult; }

  public async resetInterlock(): Promise<boolean> {
    if (!this.connected) return false;
    try {
      const result = await this.request<{ ok: boolean }>('/interlock-reset', { method: 'POST', body: JSON.stringify({}) });
      this.activeSignals.processPermit = false;
      return result.ok;
    } catch {
      this.activeSignals.processPermit = false;
      return false;
    }
  }
}
