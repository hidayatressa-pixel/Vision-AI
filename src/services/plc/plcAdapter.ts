/**
 * PLC Communication Interface and Base Types
 * Decouples vision inspection logic from specific PLC hardware vendors.
 */

import { PLCConfiguration, PLCInspectionPayload, PLCLiveSignals } from '../../types/plc';

export interface PLCAdapter {
  readonly protocol: string;
  readonly isConnected: boolean;

  connect(config: PLCConfiguration): Promise<boolean>;
  disconnect(): Promise<void>;
  testConnection(config: PLCConfiguration): Promise<{ success: boolean; latencyMs: number; message: string }>;

  readSignals(): Promise<PLCLiveSignals>;
  writeSignals(signals: Partial<PLCLiveSignals>): Promise<boolean>;

  sendHeartbeat(beat: boolean): Promise<boolean>;
  sendInspectionResult(payload: PLCInspectionPayload): Promise<boolean>;
  waitForAck(timeoutMs: number): Promise<boolean>;
  clearResultSignals(): Promise<void>;

  readMachineState(): Promise<{ plcReady: boolean; machineReady: boolean }>;
  readPartTrigger(): Promise<boolean>;
  readAck(): Promise<boolean>;
  resetInterlock(): Promise<boolean>;
}
