/**
 * Production Metrics Bar
 * Real-time yield, cycle counters, and camera diagnostics.
 */

import React from 'react';
import { InspectionStats, SystemMetrics } from '../../types/inspection';
import { CheckCircle2, XCircle, Gauge, Activity, Radio } from 'lucide-react';

interface MetricsBarProps {
  stats: InspectionStats;
  liveMetrics: SystemMetrics;
  motionDelta: number;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({ stats, liveMetrics, motionDelta }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Total Inspected */}
      <div className="rvi-metric-card bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Total Count</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold font-mono text-white">{stats.totalInspected}</span>
          <span className="text-xs text-slate-500 font-mono">pcs</span>
        </div>
      </div>

      {/* 2. OK Passed */}
      <div className="rvi-metric-card bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Passed (OK)</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold font-mono text-emerald-400">{stats.totalOk}</span>
          <span className="text-xs text-emerald-500/70 font-mono">
            {stats.totalInspected > 0 ? `${((stats.totalOk / stats.totalInspected) * 100).toFixed(0)}%` : '100%'}
          </span>
        </div>
      </div>

      {/* 3. NG Defects */}
      <div className="rvi-metric-card bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Defects (NG)</span>
          <XCircle className="w-3.5 h-3.5 text-red-400" />
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold font-mono text-red-400">{stats.totalNg}</span>
          <span className="text-xs text-red-500/70 font-mono">
            {stats.totalInspected > 0 ? `${((stats.totalNg / stats.totalInspected) * 100).toFixed(0)}%` : '0%'}
          </span>
        </div>
      </div>

      {/* 4. Yield Rate */}
      <div className="rvi-metric-card bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Yield Rate</span>
          <Gauge className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className={`text-2xl font-bold font-mono ${stats.yieldRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {stats.yieldRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 5. Last Cycle Time */}
      <div className="rvi-metric-card bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Cycle Time</span>
          <Activity className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold font-mono text-cyan-300">
            {liveMetrics.totalCycleMs || stats.lastCycleTimeMs || 0}
          </span>
          <span className="text-xs text-slate-500 font-mono">ms</span>
        </div>
      </div>

      {/* 6. Live Camera & Motion */}
      <div className="rvi-metric-card bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Camera FPS</span>
          <span className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-400 font-mono">LIVE</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-white">{liveMetrics.cameraFps || 30}</span>
            <span className="text-xs text-slate-500 font-mono">fps</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Δ {motionDelta.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
};
