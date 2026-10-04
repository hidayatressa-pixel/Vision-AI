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

  // One-time data normalization: there must be exactly one registered
  // Reflector Assy HL GJRA master. If an older duplicate contains real
  // uploaded master/reference images, keep that configured copy and migrate
  // it onto the canonical production ID before removing duplicates.
  const reflectorMasters = existing.filter(
    (master) =>
      master.id === SEED_PRODUCT_A.id ||
      master.productCode === SEED_PRODUCT_A.productCode ||
      master.productName.trim().toLowerCase() === SEED_PRODUCT_A.productName.trim().toLowerCase()
  );

  if (reflectorMasters.length > 0) {
    const completeness = (master: MasterProduct) => {
      const revision = master.revisions.find((r) => r.id === master.activeRevisionId) || master.revisions[0];
      if (!revision) return 0;
      return (
        (revision.masterImageUrl ? 1000 : 0) +
        revision.referenceImages.filter((r) => Boolean(r.imageUrl)).length * 100 +
        (revision.anchors.length === 4 ? 20 : 0) +
        (revision.inspectionROIs.length === 8 ? 20 : 0)
      );
    };

    const source = [...reflectorMasters].sort((a, b) => {
      const scoreDiff = completeness(b) - completeness(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.id === SEED_PRODUCT_A.id ? -1 : 1;
    })[0];

    const sourceRevision =
      source.revisions.find((r) => r.id === source.activeRevisionId) || source.revisions[0];

    if (sourceRevision) {
      const canonical: MasterProduct = {
        ...source,
        id: SEED_PRODUCT_A.id,
        productCode: SEED_PRODUCT_A.productCode,
        productName: SEED_PRODUCT_A.productName,
        activeRevisionId: sourceRevision.id === 'rev-01-8screw' ? sourceRevision.id : 'rev-01-8screw',
        revisions: [{
          ...sourceRevision,
          id: 'rev-01-8screw',
          masterId: SEED_PRODUCT_A.id,
          revisionCode: 'REV-01',
          expectedObjectCount: 8,
          masterWidth: sourceRevision.masterWidth || 800,
          masterHeight: sourceRevision.masterHeight || 600,
          inspectionROIs: sourceRevision.inspectionROIs?.length === 8
            ? sourceRevision.inspectionROIs
            : SEED_PRODUCT_A.revisions[0].inspectionROIs,
          anchors: sourceRevision.anchors?.length === 4
            ? sourceRevision.anchors
            : SEED_PRODUCT_A.revisions[0].anchors,
          referenceImages: sourceRevision.referenceImages?.length === 6
            ? sourceRevision.referenceImages
            : SEED_PRODUCT_A.revisions[0].referenceImages,
        }],
        updatedAt: new Date().toISOString(),
      };

      await dbService.saveMaster(canonical);

      for (const duplicate of reflectorMasters) {
        if (duplicate.id !== SEED_PRODUCT_A.id) {
          await dbService.deleteMaster(duplicate.id);
        }
      }
      return;
    }
  }

  // Remove the old Product A seed if it still exists.
  const legacySeed = existing.find((master) => master.id === 'prd-bracket-m4');
  if (legacySeed) await dbService.deleteMaster(legacySeed.id);

  if (!existing.some((master) => master.id === SEED_PRODUCT_A.id)) {
    await dbService.saveMaster(SEED_PRODUCT_A);
  }
}
