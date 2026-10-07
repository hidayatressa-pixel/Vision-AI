import { MasterRevision } from '../types/master';

export interface SetupValidationCheck {
  label: string;
  valid: boolean;
  detail: string;
  error: string;
}

export function getMasterValidationChecks(revision: MasterRevision): SetupValidationCheck[] {
  const references = revision.referenceImages || [];

  return [
    {
      label: 'Alignment anchors',
      valid: revision.anchors.length === 4,
      detail: `${revision.anchors.length}/4 configured`,
      error: 'Exactly 4 alignment anchors are required.',
    },
    {
      label: 'Inspection ROIs',
      valid: revision.inspectionROIs.length === 8,
      detail: `${revision.inspectionROIs.length}/8 configured`,
      error: 'Exactly 8 screw inspection ROIs are required.',
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
      valid: new Set(references.map((reference) => reference.id)).size === references.length,
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
