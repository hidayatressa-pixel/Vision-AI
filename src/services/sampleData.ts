import { InspectionROI, MasterProduct, ReferenceImage } from '../types/master';

const eightScrewROIs: InspectionROI[] = [
  [0.30, 0.3333], [0.43, 0.3333], [0.57, 0.3333], [0.70, 0.3333],
  [0.30, 0.6667], [0.43, 0.6667], [0.57, 0.6667], [0.70, 0.6667],
].map(([x, y], index) => ({
  id: `roi-screw-${index + 1}`,
  name: `Screw #${index + 1}`,
  objectType: 'screw',
  x, y,
  radius: 0.04,
  toleranceRadius: 0.035,
  minConfidence: 0.65,
  isRequired: true,
}));

const anchors = [
  { id: 'anchor-A', name: 'Anchor A (Top-Left)', x: 0.25, y: 0.2667, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial A' },
  { id: 'anchor-B', name: 'Anchor B (Top-Right)', x: 0.75, y: 0.2667, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial B' },
  { id: 'anchor-C', name: 'Anchor C (Bottom-Left)', x: 0.25, y: 0.7333, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial C' },
  { id: 'anchor-D', name: 'Anchor D (Bottom-Right)', x: 0.75, y: 0.7333, searchRadius: 0.12, patchRadius: 24, description: 'Alignment fiducial D' },
];

const referenceImages: ReferenceImage[] = Array.from({ length: 6 }, (_, index) => ({
  id: `ref-${index + 1}`,
  label: `Reference ${index + 1}`,
  roiId: eightScrewROIs[index].id,
  imageUrl: '',
  description: 'Upload the approved golden reference image during Master Setup.',
}));

export const SEED_PRODUCT_A: MasterProduct = {
  id: 'prd-reflector-assy-hl-gjra',
  productCode: 'PRD-REFLECTOR-ASSY-HL-GJRA',
  productName: 'Reflector Assy HL GJRA',
  description: 'Production inspection master for an 8-screw assembly.',
  activeRevisionId: 'rev-01-8screw',
  isActive: true,
  createdAt: '2026-10-05T08:00:00Z',
  updatedAt: '2026-10-05T08:00:00Z',
  createdBy: 'System',
  revisions: [{
    id: 'rev-01-8screw',
    masterId: 'prd-reflector-assy-hl-gjra',
    revisionCode: 'REV-01',
    revisionNote: 'Initial production configuration · 8 screws',
    expectedObjectCount: 8,
    masterWidth: 800,
    masterHeight: 600,
    masterImageUrl: '',
    detectionZone: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
    anchors: anchors.map((anchor) => ({ ...anchor })),
    inspectionROIs: eightScrewROIs.map((roi) => ({ ...roi })),
    referenceImages: referenceImages.map((reference) => ({ ...reference })),
    tolerance: {
      maxPositionOffsetMm: 2.5,
      maxPositionOffsetPx: 25,
      maxRotationToleranceDeg: 12,
      minAlignmentConfidence: 0.6,
      minScrewConfidence: 0.65,
      stabilizationDelayMs: 500,
      stabilizationMotionThreshold: 8,
      partRemovalThreshold: 12,
      detectionZonePresenceThreshold: 18,
    },
    createdAt: '2026-10-05T08:00:00Z',
    updatedAt: '2026-10-05T08:00:00Z',
    createdBy: 'System',
  }],
};

export async function initSeedDataIfEmpty() {
  const { dbService } = await import('./db');
  const existing = await dbService.getAllMasters();

  if (existing.length === 0) {
    await dbService.saveMaster(SEED_PRODUCT_A);
    return;
  }

  // Remove the legacy seeded configuration without touching engineer-created masters.
  const legacySeed = existing.find((master) => master.id === 'prd-bracket-m4');
  if (legacySeed && legacySeed.id !== SEED_PRODUCT_A.id) {
    await dbService.deleteMaster(legacySeed.id);
  }

  const seeded = existing.find((master) => master.id === SEED_PRODUCT_A.id);
  if (seeded) {
    const isLegacyShape =
      seeded.productName !== SEED_PRODUCT_A.productName ||
      seeded.revisions.length !== 1 ||
      seeded.revisions.some((revision) =>
        revision.id === 'rev-01-6screw' ||
        revision.id === 'rev-02-8screw' ||
        revision.masterImageUrl.includes('product-a-')
      );

    if (isLegacyShape) {
      await dbService.saveMaster(SEED_PRODUCT_A);
    }
  }
}
