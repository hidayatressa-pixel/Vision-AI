import { InspectionROI, MasterProduct, ReferenceImage } from '../types/master';

// Actual reflector layout from the production photo:
// 4 screws across the upper brackets, 2 screws in the center, 2 screws below.
// The Master Setup editor remains the final calibration authority; these are
// only the initial seed positions and can be dragged to the exact master image.
const eightScrewROIs: InspectionROI[] = [
  [0.30, 0.3333], [0.43, 0.3333], [0.57, 0.3333], [0.70, 0.3333],
  [0.38, 0.4667], [0.62, 0.4667],
  [0.42, 0.7000], [0.58, 0.7000],
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
    // Dimensions are populated from the actual uploaded master image.
    // Do not use a synthetic 800x600 calibration canvas.
    masterWidth: 0,
    masterHeight: 0,
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

const getImageDimensions = (imageUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    if (!imageUrl) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = imageUrl;
  });

export async function initSeedDataIfEmpty() {
  const { dbService } = await import('./db');
  const existing = await dbService.getAllMasters();

  const isReflector = (master: MasterProduct) => {
    const name = (master.productName || '').trim().toLowerCase();
    const code = (master.productCode || '').trim().toLowerCase();
    return (
      master.id === SEED_PRODUCT_A.id ||
      name === SEED_PRODUCT_A.productName.toLowerCase() ||
      code === SEED_PRODUCT_A.productCode.toLowerCase() ||
      code.includes('reflector-assy-hl-gjra') ||
      name.includes('reflector assy hl gjra')
    );
  };

  const reflectorMasters = existing.filter(isReflector);

  if (reflectorMasters.length === 0) {
    // No production master exists: create exactly one clean canonical record.
    await dbService.saveMaster(SEED_PRODUCT_A);
    for (const master of existing) {
      await dbService.deleteMaster(master.id);
    }
    return;
  }

  const completeness = (master: MasterProduct) => {
    const revision =
      master.revisions.find((r) => r.id === master.activeRevisionId) ||
      master.revisions[0];
    if (!revision) return 0;

    return (
      (revision.masterImageUrl ? 1000 : 0) +
      revision.referenceImages.filter((r) => Boolean(r.imageUrl)).length * 100 +
      (revision.anchors.length === 4 ? 20 : 0) +
      (revision.inspectionROIs.length === 8 ? 20 : 0)
    );
  };

  // Keep the most complete Reflector configuration so uploaded master and
  // reference images are never discarded during cleanup.
  const source = [...reflectorMasters].sort((a, b) => {
    const scoreDiff = completeness(b) - completeness(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.id === SEED_PRODUCT_A.id ? -1 : 1;
  })[0];

  const sourceRevision =
    source.revisions.find((r) => r.id === source.activeRevisionId) ||
    source.revisions[0];

  if (!sourceRevision) {
    await dbService.saveMaster(SEED_PRODUCT_A);
  } else {
    const nativeDimensions = sourceRevision.masterImageUrl
    ? await getImageDimensions(sourceRevision.masterImageUrl)
    : { width: 0, height: 0 };

  const canonical: MasterProduct = {
      ...source,
      id: SEED_PRODUCT_A.id,
      productCode: SEED_PRODUCT_A.productCode,
      productName: SEED_PRODUCT_A.productName,
      activeRevisionId: 'rev-01-8screw',
      revisions: [{
        ...sourceRevision,
        id: 'rev-01-8screw',
        masterId: SEED_PRODUCT_A.id,
        revisionCode: 'REV-01',
        expectedObjectCount: 8,
        // Always trust the uploaded image's native dimensions. This migrates
        // old 800x600 masters without touching normalized ROI/anchor values.
        masterWidth: nativeDimensions.width || sourceRevision.masterWidth || 0,
        masterHeight: nativeDimensions.height || sourceRevision.masterHeight || 0,
        inspectionROIs:
          sourceRevision.inspectionROIs?.length === 8
            ? sourceRevision.inspectionROIs
            : SEED_PRODUCT_A.revisions[0].inspectionROIs,
        anchors:
          sourceRevision.anchors?.length === 4
            ? sourceRevision.anchors
            : SEED_PRODUCT_A.revisions[0].anchors,
        referenceImages:
          sourceRevision.referenceImages?.length === 6
            ? sourceRevision.referenceImages
            : SEED_PRODUCT_A.revisions[0].referenceImages,
      }],
      updatedAt: new Date().toISOString(),
    };

    await dbService.saveMaster(canonical);
  }

  // Production policy: only Reflector Assy HL GJRA may remain registered.
  // This removes legacy B6 / 6-screw / Product A records and any duplicates.
  for (const master of existing) {
    if (master.id !== SEED_PRODUCT_A.id) {
      await dbService.deleteMaster(master.id);
    }
  }
}
