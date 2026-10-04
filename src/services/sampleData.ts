/**
 * Production master data for the fixed line part.
 * Master images live in /public/master-images.
 */

import { InspectionROI, MasterProduct, ReferenceImage } from '../types/master';

const masterImage = (fileName: string) => `${import.meta.env.BASE_URL}master-images/${fileName}`;

const sixScrewROIs: InspectionROI[] = [
  { id: 'roi-screw-1', name: 'Screw #1', objectType: 'screw' as const, x: 0.325, y: 0.3333 },
  { id: 'roi-screw-2', name: 'Screw #2', objectType: 'screw' as const, x: 0.5, y: 0.3333 },
  { id: 'roi-screw-3', name: 'Screw #3', objectType: 'screw' as const, x: 0.675, y: 0.3333 },
  { id: 'roi-screw-4', name: 'Screw #4', objectType: 'screw' as const, x: 0.325, y: 0.6667 },
  { id: 'roi-screw-5', name: 'Screw #5', objectType: 'screw' as const, x: 0.5, y: 0.6667 },
  { id: 'roi-screw-6', name: 'Screw #6', objectType: 'screw' as const, x: 0.675, y: 0.6667 },
].map((roi) => ({ ...roi, radius: 0.04, toleranceRadius: 0.035, minConfidence: 0.65, isRequired: true }));

const eightScrewROIs: InspectionROI[] = [
  { id: 'roi-screw-1', name: 'Screw #1', objectType: 'screw' as const, x: 0.3, y: 0.3333 },
  { id: 'roi-screw-2', name: 'Screw #2', objectType: 'screw' as const, x: 0.43, y: 0.3333 },
  { id: 'roi-screw-3', name: 'Screw #3', objectType: 'screw' as const, x: 0.57, y: 0.3333 },
  { id: 'roi-screw-4', name: 'Screw #4', objectType: 'screw' as const, x: 0.7, y: 0.3333 },
  { id: 'roi-screw-5', name: 'Screw #5', objectType: 'screw' as const, x: 0.3, y: 0.6667 },
  { id: 'roi-screw-6', name: 'Screw #6', objectType: 'screw' as const, x: 0.43, y: 0.6667 },
  { id: 'roi-screw-7', name: 'Screw #7', objectType: 'screw' as const, x: 0.57, y: 0.6667 },
  { id: 'roi-screw-8', name: 'Screw #8', objectType: 'screw' as const, x: 0.7, y: 0.6667 },
].map((roi) => ({ ...roi, radius: 0.04, toleranceRadius: 0.035, minConfidence: 0.65, isRequired: true }));

const anchors = [
  { id: 'anchor-A', name: 'Anchor A (Top-Left)', x: 0.25, y: 0.2667, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial A' },
  { id: 'anchor-B', name: 'Anchor B (Top-Right)', x: 0.75, y: 0.2667, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial B' },
  { id: 'anchor-C', name: 'Anchor C (Bottom-Left)', x: 0.25, y: 0.7333, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial C' },
  { id: 'anchor-D', name: 'Anchor D (Bottom-Right)', x: 0.75, y: 0.7333, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial D' },
];

const commonTolerance = {
  maxPositionOffsetMm: 2.5,
  maxPositionOffsetPx: 25,
  maxRotationToleranceDeg: 12,
  minAlignmentConfidence: 0.6,
  minScrewConfidence: 0.65,
  stabilizationDelayMs: 500,
  stabilizationMotionThreshold: 8,
  partRemovalThreshold: 12,
  detectionZonePresenceThreshold: 18,
};

const sixScrewReferenceImages: ReferenceImage[] = sixScrewROIs.map((roi, index) => ({
  id: `ref-screw-${index + 1}`,
  label: roi.name,
  roiId: roi.id,
  imageUrl: masterImage(`references/product-a-rev01/screw-${String(index + 1).padStart(2, '0')}.png`),
  description: `Close-up golden reference for ${roi.name}. Use this image to verify appearance, orientation, and assembly condition.`,
}));

const eightScrewReferenceImages: ReferenceImage[] = eightScrewROIs.map((roi, index) => ({
  id: `ref-rev02-screw-${index + 1}`,
  label: roi.name,
  roiId: roi.id,
  imageUrl: masterImage(`references/product-a-rev01/screw-${String((index % 6) + 1).padStart(2, '0')}.png`),
  description: `Golden reference for ${roi.name}.`,
}));

const makeRevision = (
  id: string,
  code: string,
  note: string,
  count: number,
  rois: InspectionROI[],
  referenceImages: ReferenceImage[],
  imageFile: string,
  createdAt: string
) => ({
  id,
  masterId: 'prd-bracket-m4',
  revisionCode: code,
  revisionNote: note,
  expectedObjectCount: count,
  masterWidth: 800,
  masterHeight: 600,
  masterImageUrl: masterImage(imageFile),
  detectionZone: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
  anchors: anchors.map((anchor) => ({ ...anchor })),
  inspectionROIs: rois.map((roi) => ({ ...roi })),
  referenceImages: referenceImages.map((reference) => ({ ...reference })),
  tolerance: { ...commonTolerance },
  createdAt,
  updatedAt: createdAt,
  createdBy: 'Quality Engineer',
});

export const SEED_PRODUCT_A: MasterProduct = {
  id: 'prd-bracket-m4',
  productCode: 'PRD-REFLECTOR-ASSY-HL-GJRA',
  productName: 'Reflector Assy HL GJRA',
  description: 'Production master for Reflector Assy HL GJRA with 8 required screws and four alignment fiducials.',
  // Latest engineering revision is the active line configuration: 8 screws.
  activeRevisionId: 'rev-02-8screw',
  isActive: true,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
  createdBy: 'System Seed',
  revisions: [
    makeRevision(
      'rev-01-6screw',
      'REV-01',
      'Dummy baseline · 6 screws required',
      6,
      sixScrewROIs,
      sixScrewReferenceImages,
      'product-a-rev01-master.svg',
      '2026-10-01T08:00:00Z'
    ),
    makeRevision(
      'rev-02-8screw',
      'REV-02',
      'Dummy engineering revision · 8 screws required',
      8,
      eightScrewROIs,
      eightScrewReferenceImages,
      'product-a-rev02-master.svg',
      '2026-10-01T09:00:00Z'
    ),
  ],
};

export async function initSeedDataIfEmpty() {
  const { dbService } = await import('./db');
  const existing = await dbService.getAllMasters();

  if (existing.length === 0) {
    await dbService.saveMaster(SEED_PRODUCT_A);
    return;
  }

  // Migrate the original seeded Product A to the latest 8-screw revision.
  // This is intentionally limited to the known seed ID so engineering-created
  // masters/revisions remain under operator control.
  const seeded = existing.find((master) => master.id === SEED_PRODUCT_A.id);
  const latestRevision = seeded?.revisions.find((revision) => revision.id === 'rev-02-8screw');

  if (seeded && latestRevision && seeded.activeRevisionId !== latestRevision.id) {
    await dbService.saveMaster({
      ...seeded,
      activeRevisionId: latestRevision.id,
      updatedAt: new Date().toISOString(),
    });
  }
}
