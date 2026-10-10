import { MasterRevision } from '../types/master';

export interface SetupValidationCheck {
  label: string;
  valid: boolean;
  detail: string;
  error: string;
}

export function getMasterValidationChecks(revision: MasterRevision): SetupValidationCheck[] {
  const references = revision.referenceImages || [];
  const anchors = revision.anchors || [];
  const rois = revision.inspectionROIs || [];
  const uniqueAnchorIds = new Set(anchors.map((anchor) => anchor.id)).size === anchors.length && anchors.every((anchor) => Boolean(anchor.id?.trim()));
  const isNormalizedPoint = (x: number, y: number) =>
    Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
  const anchorsHaveCoordinates = anchors.every((anchor) =>
    isNormalizedPoint(anchor.x, anchor.y) &&
    Number.isFinite(anchor.searchRadius) && anchor.searchRadius > 0 &&
    Number.isFinite(anchor.patchRadius) && anchor.patchRadius > 0
  );
  const roisHaveValidGeometry = rois.every((roi) =>
    isNormalizedPoint(roi.x, roi.y) &&
    Number.isFinite(roi.radius) && roi.radius > 0 &&
    Number.isFinite(roi.toleranceRadius) && roi.toleranceRadius >= 0 &&
    Number.isFinite(roi.minConfidence) && roi.minConfidence >= 0 && roi.minConfidence <= 1
  );
  const roiIdsAreUnique = new Set(rois.map((roi) => roi.id)).size === rois.length &&
    rois.every((roi) => Boolean(roi.id?.trim()));
  const zone = revision.detectionZone;
  const detectionZoneValid = Boolean(zone) &&
    Number.isFinite(zone.x) && Number.isFinite(zone.y) &&
    Number.isFinite(zone.width) && Number.isFinite(zone.height) &&
    zone.x >= 0 && zone.y >= 0 && zone.width > 0 && zone.height > 0 &&
    zone.x + zone.width <= 1 && zone.y + zone.height <= 1;
  const roisWithinDetectionZone = detectionZoneValid && rois.every((roi) =>
    roi.x >= zone.x && roi.x <= zone.x + zone.width &&
    roi.y >= zone.y && roi.y <= zone.y + zone.height
  );
  const referencesMapOneToOne = references.length === 8 &&
    new Set(references.map((reference) => reference.roiId)).size === 8 &&
    references.every((reference) => Boolean(reference.roiId) && rois.some((roi) => roi.id === reference.roiId));

  return [
    {
      label: 'Alignment anchors',
      valid: anchors.length === 4 && uniqueAnchorIds && anchorsHaveCoordinates,
      detail: `${anchors.length}/4 configured${uniqueAnchorIds ? '' : ' · duplicate IDs'}${anchorsHaveCoordinates ? '' : ' · invalid geometry'}`,
      error: 'Exactly 4 uniquely identified alignment anchors with valid coordinates and radii are required.',
    },
    {
      label: 'Inspection ROIs',
      valid: rois.length === 8 && roisHaveValidGeometry && roiIdsAreUnique && roisWithinDetectionZone,
      detail: `${rois.length}/8 configured${!roisHaveValidGeometry ? ' · invalid geometry' : ''}${!roiIdsAreUnique ? ' · duplicate IDs' : ''}${!roisWithinDetectionZone ? ' · outside detection zone' : ''}`,
      error: 'Exactly 8 uniquely identified inspection ROIs must have valid normalized coordinates, radii, confidence, and lie within the detection zone.',
    },
    {
      label: 'Master image',
      valid: Boolean(revision.masterImageUrl?.trim()),
      detail: revision.masterImageUrl?.trim() ? 'Ready' : 'Missing',
      error: 'A master image is required.',
    },
    {
      label: 'Master resolution',
      valid: revision.masterWidth > 0 && revision.masterHeight > 0,
      detail: revision.masterWidth > 0 && revision.masterHeight > 0
        ? `${revision.masterWidth}×${revision.masterHeight}`
        : 'Invalid',
      error: 'Master dimensions are invalid.',
    },
    {
      label: 'Reference images',
      valid: references.length === 8 && references.every((reference) => Boolean(reference.imageUrl?.trim())),
      detail: `${references.filter((reference) => Boolean(reference.imageUrl?.trim())).length}/8 images ready`,
      error: references.length !== 8
        ? `Exactly 8 master reference images are required (${references.length}/8 configured).`
        : 'All 8 master reference images must contain a valid image.',
    },
    {
      label: 'Detection zone',
      valid: detectionZoneValid,
      detail: detectionZoneValid ? 'Valid normalized bounds' : 'Invalid bounds',
      error: 'The detection zone must be a valid rectangle within the master image.',
    },
    {
      label: 'Reference-to-ROI mapping',
      valid: referencesMapOneToOne,
      detail: referencesMapOneToOne ? '8/8 mapped' : 'Mapping incomplete or duplicated',
      error: 'Each of the 8 reference images must map to a different inspection ROI.',
    },
    {
      label: 'Reference IDs',
      valid: new Set(references.map((reference) => reference.id)).size === references.length && references.every((reference) => Boolean(reference.id?.trim())),
      detail: new Set(references.map((reference) => reference.id)).size === references.length ? 'Unique' : 'Duplicate IDs',
      error: 'Master reference IDs must be unique.',
    },
    {
      label: 'Expected objects',
      valid: revision.expectedObjectCount === 8 && revision.expectedObjectCount === revision.inspectionROIs.length,
      detail: `${revision.expectedObjectCount}/8 expected`,
      error: 'Expected object count must match the number of inspection ROIs.',
    },
    {
      label: 'Position tolerance',
      valid: Number.isFinite(revision.tolerance.maxPositionOffsetPx) && revision.tolerance.maxPositionOffsetPx > 0 && Number.isFinite(revision.tolerance.maxPositionOffsetMm) && revision.tolerance.maxPositionOffsetMm > 0,
      detail: `±${revision.tolerance.maxPositionOffsetMm} mm`,
      error: 'Position tolerances must be greater than zero.',
    },
    {
      label: 'Alignment confidence',
      valid: Number.isFinite(revision.tolerance.minAlignmentConfidence) && revision.tolerance.minAlignmentConfidence >= 0 && revision.tolerance.minAlignmentConfidence <= 1,
      detail: `${(revision.tolerance.minAlignmentConfidence * 100).toFixed(0)}%`,
      error: 'Alignment confidence must be between 0 and 1.',
    },
    {
      label: 'Screw confidence',
      valid: Number.isFinite(revision.tolerance.minScrewConfidence) && revision.tolerance.minScrewConfidence >= 0 && revision.tolerance.minScrewConfidence <= 1,
      detail: `${(revision.tolerance.minScrewConfidence * 100).toFixed(0)}%`,
      error: 'Minimum screw confidence must be between 0 and 1.',
    },
  ];
}
