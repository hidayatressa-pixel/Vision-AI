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
  const uniqueAnchorIds = new Set(anchors.map((anchor) => anchor.id)).size === anchors.length;
  const anchorsHaveCoordinates = anchors.every((anchor) => Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.searchRadius) && anchor.searchRadius > 0 && Number.isFinite(anchor.patchRadius) && anchor.patchRadius > 0);
  const roisHaveValidGeometry = rois.every((roi) => Number.isFinite(roi.x) && Number.isFinite(roi.y) && Number.isFinite(roi.radius) && roi.radius > 0 && Number.isFinite(roi.toleranceRadius) && roi.toleranceRadius >= 0 && Number.isFinite(roi.minConfidence) && roi.minConfidence >= 0 && roi.minConfidence <= 1);

  return [
    {
      label: 'Alignment anchors',
      valid: anchors.length === 4 && uniqueAnchorIds && anchorsHaveCoordinates,
      detail: `${anchors.length}/4 configured${uniqueAnchorIds ? '' : ' · duplicate IDs'}${anchorsHaveCoordinates ? '' : ' · invalid geometry'}`,
      error: 'Exactly 4 uniquely identified alignment anchors with valid coordinates and radii are required.',
    },
    {
      label: 'Inspection ROIs',
      valid: rois.length === 8 && roisHaveValidGeometry,
      detail: `${rois.length}/8 configured${roisHaveValidGeometry ? '' : ' · invalid geometry'}`,
      error: 'Exactly 8 inspection ROIs with valid coordinates, radii, tolerance, and confidence are required.',
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
      valid: revision.tolerance.maxPositionOffsetPx > 0 && revision.tolerance.maxPositionOffsetMm > 0,
      detail: `±${revision.tolerance.maxPositionOffsetMm} mm`,
      error: 'Position tolerances must be greater than zero.',
    },
    {
      label: 'Alignment confidence',
      valid: revision.tolerance.minAlignmentConfidence >= 0 && revision.tolerance.minAlignmentConfidence <= 1,
      detail: `${(revision.tolerance.minAlignmentConfidence * 100).toFixed(0)}%`,
      error: 'Alignment confidence must be between 0 and 1.',
    },
  ];
}
