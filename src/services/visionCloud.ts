const VISION_API_URL =
  'https://tfu0e7nbj0.execute-api.ap-southeast-2.amazonaws.com/default/vision-ai-backend';

export interface VisionCloudEvent {
  status: 'OK' | 'NG' | 'INVALID' | 'ERROR' | 'STANDBY';
  confidence: number;
  mode: 'CONTINUOUS';
  jig: string;
  inspectionId?: string;
  timestamp: string;
  productCode?: string;
  revisionCode?: string;
  detectedCount?: number;
  expectedCount?: number;
  reason?: string;
}

let lastLifecycleStatus: VisionCloudEvent['status'] | null = null;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export async function sendVisionEvent(event: VisionCloudEvent): Promise<void> {
  try {
    const response = await fetch(VISION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Vision API returned HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('[VisionCloud] Event send failed:', error);
  }
}

export function sendInspectionResult(params: {
  status: 'OK' | 'NG' | 'INVALID' | 'ERROR';
  alignmentConfidence: number;
  roiConfidences: number[];
  jig: string;
  inspectionId: string;
  productCode: string;
  revisionCode: string;
  detectedCount: number;
  expectedCount: number;
  reason: string;
}): void {
  const roiValues = params.roiConfidences.filter(Number.isFinite);
  const confidenceValues = [
    clampConfidence(params.alignmentConfidence),
    ...roiValues.map(clampConfidence),
  ];
  const confidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;

  const event: VisionCloudEvent = {
    status: params.status,
    confidence: Number(confidence.toFixed(3)),
    mode: 'CONTINUOUS',
    jig: params.jig,
    inspectionId: params.inspectionId,
    timestamp: new Date().toISOString(),
    productCode: params.productCode,
    revisionCode: params.revisionCode,
    detectedCount: params.detectedCount,
    expectedCount: params.expectedCount,
    reason: params.reason,
  };

  void sendVisionEvent(event);
}

export function sendStandbyEvent(jig: string): void {
  if (lastLifecycleStatus === 'STANDBY') return;

  lastLifecycleStatus = 'STANDBY';

  void sendVisionEvent({
    status: 'STANDBY',
    confidence: 1,
    mode: 'CONTINUOUS',
    jig,
    timestamp: new Date().toISOString(),
  });
}

export function markInspectionLifecycleComplete(status: 'OK' | 'NG' | 'INVALID' | 'ERROR'): void {
  lastLifecycleStatus = status;
}
