/**
 * Simulated PLC Adapter
 * Full-fidelity industrial PLC simulation for development, machine dry-runs,
 * testing of OK/NG/Error flows, timeouts, and fault injection.
 */

import { PLCConfiguration, PLCInspectionPayload, PLCLiveSignals } from '../../types/plc';
import { PLCAdapter } from './plcAdapter';

export class SimulatedPLCAdapter implements PLCAdapter {
  readonly protocol = 'SIMULATION';
  private connected = false;
  private config: PLCConfiguration | null = null;

  // Internal simulated PLC registers & coils
  private signals: PLCLiveSignals = {
    plcReady: true,
    machineReady: true,
    partPresent: false,
    cycleActive: false,
    ackResult: false,
    resetRequest: false,
    interlockReset: false,
    heartbeatRequest: true,

    visionReady: false,
    visionBusy: false,
    inspectionComplete: false,
    inspectionOk: false,
    inspectionNg: false,
    inspectionError: false,
    visionHeartbeat: false,
    alignmentOk: false,
    partValid: false,
    processPermit: false,
  };

  // Fault injection flags for testing
  public injectFaults = {
    dropConnection: false,
    ignoreAck: false,
    delayAckMs: 40,
    machineNotReady: false,
    heartbeatTimeout: false,
    simulatedLatencyMs: 12,
  };

  public get isConnected(): boolean {
    return this.connected && !this.injectFaults.dropConnection;
  }

  public async connect(config: PLCConfiguration): Promise<boolean> {
    this.config = config;
    await new Promise((r) => setTimeout(r, 60)); // Sim network handshake
    if (this.injectFaults.dropConnection) {
      this.connected = false;
      return false;
    }
    this.connected = true;
    this.signals.plcReady = !this.injectFaults.machineNotReady;
    this.signals.machineReady = !this.injectFaults.machineNotReady;
    return true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.signals.processPermit = false;
    this.signals.visionReady = false;
    this.signals.inspectionComplete = false;
  }

  public async testConnection(config: PLCConfiguration): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const start = performance.now();
    await new Promise((r) => setTimeout(r, this.injectFaults.simulatedLatencyMs + 5));
    const latency = Math.round(performance.now() - start);

    if (this.injectFaults.dropConnection) {
      return { success: false, latencyMs: latency, message: 'Simulated connection dropped (Fault Injected)' };
    }
    return {
      success: true,
      latencyMs: latency,
      message: `Simulated PLC reachable at ${config.ipAddress}:${config.port} (Cycle scan: ${latency}ms)`,
    };
  }

  public async readSignals(): Promise<PLCLiveSignals> {
    if (!this.isConnected) {
      throw new Error('PLC is disconnected');
    }
    await new Promise((r) => setTimeout(r, 2));
    return { ...this.signals };
  }

  public async writeSignals(updates: Partial<PLCLiveSignals>): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }
    Object.assign(this.signals, updates);
    return true;
  }

  public async sendHeartbeat(beat: boolean): Promise<boolean> {
    if (!this.isConnected || this.injectFaults.heartbeatTimeout) {
      return false;
    }
    this.signals.visionHeartbeat = beat;
    return true;
  }

  public async sendInspectionResult(payload: PLCInspectionPayload): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    // Set inspection outputs to PLC
    this.signals.inspectionComplete = true;
    this.signals.alignmentOk = payload.alignmentOk;

    if (payload.judgement === 'OK') {
      this.signals.inspectionOk = true;
      this.signals.inspectionNg = false;
      this.signals.inspectionError = false;
    } else if (payload.judgement === 'NG') {
      this.signals.inspectionOk = false;
      this.signals.inspectionNg = true;
      this.signals.inspectionError = false;
    } else {
      // Vision System / Alignment Failure
      this.signals.inspectionOk = false;
      this.signals.inspectionNg = false;
      this.signals.inspectionError = true;
    }

    // Simulate real PLC ladder logic:
    // If PLC is ready, machine is ready, and inspection is OK, PLC grants process permit!
    if (!this.injectFaults.ignoreAck) {
      setTimeout(() => {
        this.signals.ackResult = true;

        if (
          payload.judgement === 'OK' &&
          this.signals.plcReady &&
          this.signals.machineReady &&
          !this.injectFaults.machineNotReady
        ) {
          this.signals.processPermit = true; // Machine permitted to proceed!
        } else {
          this.signals.processPermit = false; // Interlock blocks machine!
        }
      }, this.injectFaults.delayAckMs);
    }

    return true;
  }

  public async waitForAck(timeoutMs: number): Promise<boolean> {
    if (!this.isConnected || this.injectFaults.ignoreAck) {
      return false;
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.signals.ackResult) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    return false; // Timed out waiting for PLC ACK
  }

  public async clearResultSignals(): Promise<void> {
    this.signals.inspectionComplete = false;
    this.signals.inspectionOk = false;
    this.signals.inspectionNg = false;
    this.signals.inspectionError = false;
    this.signals.ackResult = false;
  }

  public async readMachineState(): Promise<{ plcReady: boolean; machineReady: boolean }> {
    return {
      plcReady: this.signals.plcReady && !this.injectFaults.machineNotReady,
      machineReady: this.signals.machineReady && !this.injectFaults.machineNotReady,
    };
  }

  public async readPartTrigger(): Promise<boolean> {
    return this.signals.partPresent;
  }

  public async readAck(): Promise<boolean> {
    return this.signals.ackResult;
  }

  public async resetInterlock(): Promise<boolean> {
    this.signals.processPermit = false;
    this.signals.ackResult = false;
    this.signals.inspectionComplete = false;
    return true;
  }

  // Helper for UI to simulate physical inputs
  public setSimulatedPlcInputs(inputs: {
    plcReady?: boolean;
    machineReady?: boolean;
    partPresent?: boolean;
  }) {
    if (inputs.plcReady !== undefined) this.signals.plcReady = inputs.plcReady;
    if (inputs.machineReady !== undefined) this.signals.machineReady = inputs.machineReady;
    if (inputs.partPresent !== undefined) this.signals.partPresent = inputs.partPresent;
  }
}
