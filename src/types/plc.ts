/**
 * PLC Integration, Industrial Protocols, and Interlock Types
 */

export type PLCProtocol =
  | 'SIMULATION'
  | 'MODBUS_TCP'
  | 'OPC_UA'
  | 'ETHERNET_IP'
  | 'SIEMENS_S7'
  | 'REST_GATEWAY';

export type PLCTriggerMode = 'AUTO_CAMERA' | 'PLC' | 'HYBRID';

export type PLCConnectionStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'TIMEOUT'
  | 'PROTOCOL_ERROR'
  | 'SIMULATING';

export type InterlockState = 'PERMITTED' | 'BLOCKED' | 'WAITING_INSPECTION' | 'COMMUNICATION_FAULT';

export interface PLCTagMapping {
  // Inputs from PLC
  plcReady: string; // e.g. "Coil 100" or "DB10.DBX0.0" or "ns=2;s=PLC_Ready"
  machineReady: string;
  partPresent: string;
  cycleActive: string;
  ackResult: string;
  resetRequest: string;
  interlockReset: string;
  heartbeatRequest: string;

  // Outputs to PLC
  visionReady: string;
  visionBusy: string;
  inspectionComplete: string;
  inspectionOk: string;
  inspectionNg: string;
  inspectionError: string;
  visionHeartbeat: string;
  alignmentOk: string;
  partValid: string;
  processPermit: string;
}

export interface PLCConfiguration {
  enabled: boolean;
  protocol: PLCProtocol;
  ipAddress: string;
  port: number;
  gatewayBaseUrl?: string; // HTTP bridge used by the browser for physical PLC I/O
  rack?: number; // Siemens specific
  slot?: number; // Siemens specific
  stationId?: number; // Modbus slave/unit ID
  reconnectIntervalMs: number;
  connectionTimeoutMs: number;
  heartbeatIntervalMs: number; // e.g. 500 ms
  heartbeatTimeoutMs: number; // e.g. 1500 ms
  ackTimeoutMs: number; // e.g. 1000 ms
  maxInspectionTimeoutMs: number; // e.g. 2000 ms
  resultHoldTimeMs: number; // e.g. 600 ms
  triggerMode: PLCTriggerMode;
  tags: PLCTagMapping;
}

export interface PLCLiveSignals {
  // From PLC
  plcReady: boolean;
  machineReady: boolean;
  partPresent: boolean;
  cycleActive: boolean;
  ackResult: boolean;
  resetRequest: boolean;
  interlockReset: boolean;
  heartbeatRequest: boolean;

  // From Vision System
  visionReady: boolean;
  visionBusy: boolean;
  inspectionComplete: boolean;
  inspectionOk: boolean;
  inspectionNg: boolean;
  inspectionError: boolean;
  visionHeartbeat: boolean;
  alignmentOk: boolean;
  partValid: boolean;
  processPermit: boolean;
}

export interface PLCEventLogItem {
  timestamp: string;
  elapsedMs: number;
  eventName: string;
  source: 'PLC' | 'VISION' | 'INTERLOCK';
  description: string;
  payload?: Record<string, unknown>;
}

export interface PLCHandshakeState {
  connectionStatus: PLCConnectionStatus;
  lastHeartbeatSendTime: number;
  lastHeartbeatAckTime: number;
  heartbeatHealthy: boolean;
  interlockState: InterlockState;
  lastInspectionId: string | null;
  lastSequenceNumber: number;
  lastResultSent: 'OK' | 'NG' | 'ERROR' | null;
  ackReceived: boolean;
  ackPending: boolean;
  roundTripLatencyMs: number;
  activeCycleTimeline: PLCEventLogItem[];
  commErrorCount: number;
  lastErrorMessage?: string;
}

export interface PLCInspectionPayload {
  sequenceNumber: number;
  inspectionId: string;
  timestamp: string;
  productCode: string;
  revisionCode: string;
  judgement: 'OK' | 'NG' | 'ERROR';
  isProductNg: boolean;
  isSystemError: boolean;
  failureReason?: string;
  detectedCount: number;
  expectedCount: number;
  alignmentOk: boolean;
  cycleTimeMs: number;
}
