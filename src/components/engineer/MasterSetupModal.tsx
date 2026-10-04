/**
 * Master Setup & Calibration Modal
 * Interactive visual canvas editor for Anchors A, B, C, D, ROIs, and Tolerances.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Save,
  Crosshair,
    Images,
  Upload,
} from 'lucide-react';
import { InspectionROI, MasterProduct, MasterRevision } from '../../types/master';
import { dbService } from '../../services/db';

interface MasterSetupModalProps {
  master: MasterProduct;
  revision: MasterRevision;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const MasterSetupModal: React.FC<MasterSetupModalProps> = ({
  master,
  revision,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'VISUAL' | 'TOLERANCES'>('VISUAL');
  const [editedRevision, setEditedRevision] = useState<MasterRevision>({ ...revision });
  const [selectedItemType, setSelectedItemType] = useState<'ANCHOR' | 'ROI'>('ROI');
  const [selectedId, setSelectedId] = useState<string>('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    setEditedRevision({ ...revision });
    setSelectedReferenceId(revision.referenceImages?.[0]?.id || '');
  }, [revision]);

  // Redraw master image with interactive anchors and ROIs
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = editedRevision.masterImageUrl;
    img.onload = () => {
      canvas.width = editedRevision.masterWidth || 800;
      canvas.height = editedRevision.masterHeight || 600;

      // Draw reference master image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw Detection Zone
      const dz = editedRevision.detectionZone;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(dz.x * w, dz.y * h, dz.width * w, dz.height * h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.05)';
      ctx.fillRect(dz.x * w, dz.y * h, dz.width * w, dz.height * h);

      ctx.font = '10px monospace';
      ctx.fillStyle = '#06b6d4';
      ctx.fillText('DETECTION ZONE', dz.x * w + 8, dz.y * h + 16);

      // 2. Draw Anchors (Fiducials A, B, C, D)
      for (const a of editedRevision.anchors) {
        const ax = a.x * w;
        const ay = a.y * h;
        const isSel = selectedItemType === 'ANCHOR' && selectedId === a.id;

        ctx.strokeStyle = isSel ? '#f59e0b' : '#38bdf8';
        ctx.lineWidth = isSel ? 3 : 2;

        ctx.beginPath();
        ctx.arc(ax, ay, 12, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(ax - 18, ay);
        ctx.lineTo(ax + 18, ay);
        ctx.moveTo(ax, ay - 18);
        ctx.lineTo(ax, ay + 18);
        ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = isSel ? '#f59e0b' : '#38bdf8';
        ctx.fillText(a.name, ax + 14, ay - 6);
      }

      // 3. Draw Inspection ROIs
      for (const roi of editedRevision.inspectionROIs) {
        const rx = roi.x * w;
        const ry = roi.y * h;
        const isSel = selectedItemType === 'ROI' && selectedId === roi.id;

        // Radius
        const rPx = 22;
        ctx.strokeStyle = isSel ? '#f59e0b' : '#10b981';
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.beginPath();
        ctx.arc(rx, ry, rPx, 0, Math.PI * 2);
        ctx.stroke();

        // Tolerance radius boundary
        const tolPx = editedRevision.tolerance.maxPositionOffsetPx || 25;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(rx, ry, tolPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = isSel ? '#f59e0b' : '#10b981';
        ctx.textAlign = 'center';
        ctx.fillText(roi.name, rx, ry + rPx + 14);
      }
    };
  }, [editedRevision, isOpen, selectedId, selectedItemType]);

  // Handle canvas click to drag/select anchor or ROI
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const normX = clickX / canvas.width;
    const normY = clickY / canvas.height;

    // Check Anchors first
    for (const a of editedRevision.anchors) {
      const ax = a.x * canvas.width;
      const ay = a.y * canvas.height;
      if (Math.hypot(clickX - ax, clickY - ay) < 25) {
        setSelectedItemType('ANCHOR');
        setSelectedId(a.id);
        isDraggingRef.current = true;
        return;
      }
    }

    // Check ROIs
    for (const r of editedRevision.inspectionROIs) {
      const rx = r.x * canvas.width;
      const ry = r.y * canvas.height;
      if (Math.hypot(clickX - rx, clickY - ry) < 28) {
        setSelectedItemType('ROI');
        setSelectedId(r.id);
        isDraggingRef.current = true;
        return;
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const normX = Math.max(0.05, Math.min(0.95, clickX / canvas.width));
    const normY = Math.max(0.05, Math.min(0.95, clickY / canvas.height));

    if (selectedItemType === 'ANCHOR') {
      setEditedRevision((prev) => ({
        ...prev,
        anchors: prev.anchors.map((a) => (a.id === selectedId ? { ...a, x: normX, y: normY } : a)),
      }));
    } else if (selectedItemType === 'ROI') {
      setEditedRevision((prev) => ({
        ...prev,
        inspectionROIs: prev.inspectionROIs.map((r) =>
          r.id === selectedId ? { ...r, x: normX, y: normY } : r
        ),
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleReplaceMasterImage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditedRevision((prev) => ({
        ...prev,
        masterImageUrl: String(reader.result || ''),
      }));
    };
    reader.readAsDataURL(file);
  };

  const selectedReference = editedRevision.referenceImages?.find((reference) => reference.id === selectedReferenceId);

  const handleReplaceReferenceImage = (referenceId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setEditedRevision((prev) => ({
        ...prev,
        referenceImages: (prev.referenceImages || []).map((reference) =>
          reference.id === referenceId ? { ...reference, imageUrl: dataUrl } : reference
        ),
      }));
    };
    reader.readAsDataURL(file);
  };

  // Save changes to database
  const handleSave = async () => {
    setSaveError(null);
    const tolerance = editedRevision.tolerance;
    const errors: string[] = [];
    if (editedRevision.anchors.length !== 4) errors.push('Exactly 4 alignment anchors are required.');
    if (editedRevision.inspectionROIs.length !== 8) errors.push('Exactly 8 screw inspection ROIs are required.');
    if (!editedRevision.masterImageUrl || !editedRevision.masterImageUrl.trim()) errors.push('A master image is required.');
    const references = editedRevision.referenceImages || [];
    if (references.length !== 6) {
      errors.push(`Exactly 6 master reference images are required (${references.length}/6 configured).`);
    }
    if (references.some((reference) => !reference.imageUrl || !reference.imageUrl.trim())) {
      errors.push('All 6 master reference images must contain a valid image.');
    }
    if (new Set(references.map((reference) => reference.id)).size !== references.length) {
      errors.push('Master reference IDs must be unique.');
    }
    if (editedRevision.expectedObjectCount !== 8 || editedRevision.expectedObjectCount !== editedRevision.inspectionROIs.length) {
      errors.push('Expected object count must match the number of inspection ROIs.');
    }
    if (tolerance.maxPositionOffsetPx <= 0 || tolerance.maxPositionOffsetMm <= 0) {
      errors.push('Position tolerances must be greater than zero.');
    }
    if (tolerance.minAlignmentConfidence < 0 || tolerance.minAlignmentConfidence > 1) {
      errors.push('Alignment confidence must be between 0 and 1.');
    }
    if (errors.length > 0) {
      setSaveError(errors.join(' '));
      return;
    }

    const updatedRevisions = master.revisions.map((r) => (r.id === editedRevision.id ? editedRevision : r));
    const updatedMaster: MasterProduct = {
      ...master,
      revisions: updatedRevisions,
      updatedAt: new Date().toISOString(),
    };

    await dbService.saveMaster(updatedMaster);
    onSaved();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Master Calibration & ROI Editor · {master.productName} ({editedRevision.revisionCode})
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Position anchors, configure expected screws, and adjust allowable tolerances.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveError && (
              <div className="hidden md:block max-w-md text-[10px] text-red-300 bg-red-950/70 border border-red-500/50 rounded-lg px-2.5 py-1.5">
                {saveError}
              </div>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-colors shadow-lg"
            >
              <Save className="w-4 h-4" />
              <span>Save & Update</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Interactive Canvas Area */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative aspect-[4/3] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center select-none">
              <div className="absolute left-3 top-3 z-10 rounded-lg border border-cyan-500/30 bg-slate-950/85 px-2 py-1 text-[10px] font-mono text-cyan-300 backdrop-blur-sm">MASTER IMAGE · {editedRevision.revisionCode}</div>
              {editedRevision.masterImageUrl ? (
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                  className="w-full h-full object-contain cursor-crosshair"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <Images className="h-10 w-10 text-slate-600" />
                  <div>
                    <div className="text-sm font-semibold text-white">Master image not configured</div>
                    <div className="mt-1 text-xs text-slate-500">Upload the approved full-view image to define the alignment reference.</div>
                  </div>
                  <label className="cursor-pointer rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20">
                    Upload Master Image
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleReplaceMasterImage(e.target.files?.[0] || null)} />
                  </label>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Images className="w-4 h-4 text-cyan-400" />
                    Reference Image Set
                    <span className="text-[10px] font-mono text-slate-500">({editedRevision.referenceImages?.length || 0} images)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Close-up golden references shown side-by-side for judgement verification.</p>
                </div>
                {selectedReference && (
                  <div className="hidden sm:block text-right text-[10px] font-mono">
                    <div className="text-cyan-300">Selected: {selectedReference.label}</div>
                    <div className="text-slate-500">Linked ROI: {selectedReference.roiId || '—'}</div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {(editedRevision.referenceImages || []).map((reference) => {
                  const isSelected = reference.id === selectedReferenceId;
                  return (
                    <div
                      key={reference.id}
                      onClick={() => {
                        setSelectedReferenceId(reference.id);
                        if (reference.roiId) {
                          setSelectedId(reference.roiId);
                          setSelectedItemType('ROI');
                        }
                      }}
                      className={`group shrink-0 w-28 rounded-xl border p-1.5 cursor-pointer transition-all ${
                        isSelected ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-950/30' : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                      }`}
                    >
                      <div className="aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                        <img src={reference.imageUrl} alt={reference.label} className="h-full w-full object-cover" />
                      </div>
                      <div className="px-1 pt-1.5">
                        <div className={`text-[10px] font-mono font-bold truncate ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>{reference.label}</div>
                        <label className="mt-1 flex items-center gap-1 text-[9px] font-mono text-slate-500 hover:text-cyan-300 cursor-pointer">
                          <Upload className="w-3 h-3" /> Replace
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleReplaceReferenceImage(reference.id, e.target.files?.[0] || null)}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div>
                <div className="text-xs font-semibold text-white">Master Image</div>
                <div className="text-[10px] font-mono text-slate-500">Full-view image used as the layout and alignment reference.</div>
              </div>
              <label className="shrink-0 cursor-pointer rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-500/50">
                {editedRevision.masterImageUrl ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleReplaceMasterImage(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
              <span>Master image = layout/alignment reference. Close-up references = visual evidence for each inspection point.</span>
              <span className="text-cyan-400">Master Res: {editedRevision.masterWidth}x{editedRevision.masterHeight}</span>
            </div>
          </div>

          {/* Right Control Panels */}
          <div className="space-y-4">
            {/* Navigation Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('VISUAL')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium text-center transition-colors ${
                  activeTab === 'VISUAL' ? 'bg-slate-800 text-cyan-400 font-bold' : 'text-slate-400'
                }`}
              >
                ROIs ({editedRevision.inspectionROIs.length})
              </button>
              <button
                onClick={() => setActiveTab('TOLERANCES')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium text-center transition-colors ${
                  activeTab === 'TOLERANCES' ? 'bg-slate-800 text-cyan-400 font-bold' : 'text-slate-400'
                }`}
              >
                Tolerances
              </button>
            </div>

            {activeTab === 'VISUAL' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    Inspection Screws
                  </span>
                  <span className="text-[10px] font-mono text-cyan-300">8 required</span>
                </div>

                {selectedReference && (
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 mb-2">Selected Golden Reference</div>
                    <div className="flex items-center gap-3">
                      <img src={selectedReference.imageUrl} alt={selectedReference.label} className="w-20 h-20 rounded-lg object-cover border border-slate-700 bg-slate-950" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">{selectedReference.label}</div>
                        <div className="text-[10px] font-mono text-slate-500 mt-1">{selectedReference.description || 'Reference evidence for the selected inspection point.'}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                  {editedRevision.inspectionROIs.map((roi) => {
                    const isSelected = selectedId === roi.id && selectedItemType === 'ROI';

                    return (
                      <div
                        key={roi.id}
                        onClick={() => {
                          setSelectedId(roi.id);
                          setSelectedItemType('ROI');
                          const matchingReference = editedRevision.referenceImages?.find((reference) => reference.roiId === roi.id);
                          if (matchingReference) setSelectedReferenceId(matchingReference.id);
                        }}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-slate-800 border-cyan-500 shadow-md'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <input
                            type="text"
                            value={roi.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditedRevision((prev) => ({
                                ...prev,
                                inspectionROIs: prev.inspectionROIs.map((r) =>
                                  r.id === roi.id ? { ...r, name: val } : r
                                ),
                              }));
                            }}
                            className="bg-transparent font-bold text-white font-mono focus:outline-none focus:border-b border-cyan-400"
                          />

                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
                          <div>Pos X: {(roi.x * 100).toFixed(1)}%</div>
                          <div>Pos Y: {(roi.y * 100).toFixed(1)}%</div>
                          <div>Min Conf: {(roi.minConfidence * 100).toFixed(0)}%</div>
                          <div>Type: {roi.objectType}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'TOLERANCES' && (
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                  {/* Position Offset Tolerance */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-slate-300">Position Tolerance:</span>
                      <span className="text-cyan-400 font-bold">
                        ±{editedRevision.tolerance.maxPositionOffsetMm} mm ({editedRevision.tolerance.maxPositionOffsetPx} px)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="6.0"
                      step="0.5"
                      value={editedRevision.tolerance.maxPositionOffsetMm}
                      onChange={(e) => {
                        const mm = parseFloat(e.target.value);
                        setEditedRevision((prev) => ({
                          ...prev,
                          tolerance: {
                            ...prev.tolerance,
                            maxPositionOffsetMm: mm,
                            maxPositionOffsetPx: Math.round(mm * 10),
                          },
                        }));
                      }}
                      className="w-full accent-cyan-500"
                    />
                  </div>

                  {/* Stabilization Delay */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-slate-300">Stabilization Delay:</span>
                      <span className="text-cyan-400 font-bold">
                        {editedRevision.tolerance.stabilizationDelayMs} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="1500"
                      step="50"
                      value={editedRevision.tolerance.stabilizationDelayMs}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setEditedRevision((prev) => ({
                          ...prev,
                          tolerance: {
                            ...prev.tolerance,
                            stabilizationDelayMs: val,
                          },
                        }));
                      }}
                      className="w-full accent-cyan-500"
                    />
                    <p className="text-[10px] text-slate-500 font-mono mt-1">
                      Time camera waits after part entry to ensure vibration/settle stops.
                    </p>
                  </div>

                  {/* Minimum Screw Confidence */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-slate-300">Detection Confidence:</span>
                      <span className="text-cyan-400 font-bold">
                        {(editedRevision.tolerance.minScrewConfidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.4"
                      max="0.9"
                      step="0.05"
                      value={editedRevision.tolerance.minScrewConfidence}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setEditedRevision((prev) => ({
                          ...prev,
                          tolerance: {
                            ...prev.tolerance,
                            minScrewConfidence: val,
                          },
                        }));
                      }}
                      className="w-full accent-cyan-500"
                    />
                  </div>

                  {/* Rotation Tolerance */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-slate-300">Max Rotation Allowed:</span>
                      <span className="text-cyan-400 font-bold">
                        ±{editedRevision.tolerance.maxRotationToleranceDeg}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="1"
                      value={editedRevision.tolerance.maxRotationToleranceDeg}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setEditedRevision((prev) => ({
                          ...prev,
                          tolerance: {
                            ...prev.tolerance,
                            maxRotationToleranceDeg: val,
                          },
                        }));
                      }}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
