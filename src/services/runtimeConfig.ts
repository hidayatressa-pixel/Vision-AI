export interface RuntimeIdentity {
  stationId: string;
  operatorId: string;
}

const KEY = 'vision_runtime_identity';

const DEFAULT_IDENTITY: RuntimeIdentity = {
  stationId: 'STAND-CAM-01',
  operatorId: 'OP-STATION-4',
};

export function getRuntimeIdentity(): RuntimeIdentity {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return { ...DEFAULT_IDENTITY };
    const parsed = JSON.parse(saved) as Partial<RuntimeIdentity>;
    return {
      stationId: parsed.stationId?.trim() || DEFAULT_IDENTITY.stationId,
      operatorId: parsed.operatorId?.trim() || DEFAULT_IDENTITY.operatorId,
    };
  } catch {
    return { ...DEFAULT_IDENTITY };
  }
}

export function saveRuntimeIdentity(identity: RuntimeIdentity): void {
  localStorage.setItem(KEY, JSON.stringify({
    stationId: identity.stationId.trim(),
    operatorId: identity.operatorId.trim(),
  }));
}
