/**
 * Persistence service for Vision-AI.
 *
 * Master configuration remains local to the station for now. Inspection history
 * is cloud-first and is stored in Supabase/PostgREST so every device sees the
 * same history. No service-role key is ever used in the browser.
 */

import { InspectionRecord, InspectionStats } from '../types/inspection';
import { MasterProduct } from '../types/master';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const HISTORY_TABLE = 'inspection_history';

class DatabaseService {
  private getCloudConfig() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error(
        'Cloud database is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
      );
    }
    return { url: `${SUPABASE_URL}/rest/v1/${HISTORY_TABLE}`, key: SUPABASE_KEY };
  }

  private async request<T = unknown>(path = '', init: RequestInit = {}): Promise<T> {
    const config = this.getCloudConfig();
    const response = await fetch(`${config.url}${path}`, {
      ...init,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Cloud database error ${response.status}: ${body || response.statusText}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  // --- Master Operations ---
  // Master configuration is intentionally kept station-local until the
  // approved source-controlled master asset package is bundled.
  private masterCache = new Map<string, MasterProduct>();

  public async getAllMasters(): Promise<MasterProduct[]> {
    return Array.from(this.masterCache.values());
  }

  public async getMasterById(id: string): Promise<MasterProduct | null> {
    return this.masterCache.get(id) || null;
  }

  public async deleteMaster(id: string): Promise<void> {
    this.masterCache.delete(id);
  }

  public async saveMaster(master: MasterProduct): Promise<void> {
    this.masterCache.set(master.id, master);
  }

  // --- Cloud Inspection History ---

  private toCloudRecord(record: InspectionRecord) {
    return {
      id: record.id,
      timestamp: record.timestamp,
      product_id: record.productId,
      product_code: record.productCode,
      product_name: record.productName,
      master_id: record.masterId,
      master_revision_id: record.masterRevisionId,
      master_revision_code: record.masterRevisionCode,
      judgement: record.judgement,
      expected_count: record.expectedCount,
      detected_count: record.detectedCount,
      defects: record.defects,
      primary_reason: record.primaryReason,
      metrics: record.metrics,
      alignment: record.alignment,
      roi_results: record.roiResults,
      extra_objects: record.extraObjects,
      thumbnail_base64: record.thumbnailBase64 || null,
      device_id: record.deviceId,
      operator_id: record.operatorId || null,
      sequence_number: record.sequenceNumber ?? null,
      plc_interlock_state: record.plcInterlockState || null,
      plc_comm_latency_ms: record.plcCommLatencyMs ?? null,
      plc_timeline: record.plcTimeline || null,
    };
  }

  private fromCloudRecord(row: any): InspectionRecord {
    return {
      id: row.id,
      timestamp: row.timestamp,
      productId: row.product_id,
      productCode: row.product_code,
      productName: row.product_name,
      masterId: row.master_id,
      masterRevisionId: row.master_revision_id,
      masterRevisionCode: row.master_revision_code,
      judgement: row.judgement,
      expectedCount: row.expected_count,
      detectedCount: row.detected_count,
      defects: row.defects || [],
      primaryReason: row.primary_reason || '',
      metrics: row.metrics || {},
      alignment: row.alignment || {},
      roiResults: row.roi_results || [],
      extraObjects: row.extra_objects || [],
      thumbnailBase64: row.thumbnail_base64 || undefined,
      deviceId: row.device_id,
      operatorId: row.operator_id || undefined,
      syncedToCloud: true,
      sequenceNumber: row.sequence_number ?? undefined,
      plcInterlockState: row.plc_interlock_state || undefined,
      plcCommLatencyMs: row.plc_comm_latency_ms ?? undefined,
      plcTimeline: row.plc_timeline || undefined,
    };
  }

  public async saveInspectionRecord(record: InspectionRecord): Promise<void> {
    await this.request('', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(this.toCloudRecord(record)),
    });
  }

  public async getRecentInspections(limit = 500): Promise<InspectionRecord[]> {
    // Cloud history is optional for local camera/vision development. If
    // Supabase is not configured, return an empty history instead of allowing
    // the dashboard/statistics layer to crash the whole application.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return [];
    }

    const rows = await this.request<any[]>(`?select=*&order=timestamp.desc&limit=${Math.max(1, Math.min(limit, 5000))}`);
    return rows.map((row) => this.fromCloudRecord(row));
  }

  public async getFilteredInspections(filters: {
    productId?: string;
    judgement?: string;
    search?: string;
    limit?: number;
  }): Promise<InspectionRecord[]> {
    const records = await this.getRecentInspections(filters.limit || 1000);
    return records.filter((item) => {
      if (filters.productId && item.productId !== filters.productId) return false;
      if (filters.judgement && filters.judgement !== 'ALL' && item.judgement !== filters.judgement) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          item.productName.toLowerCase().includes(q) ||
          item.productCode.toLowerCase().includes(q) ||
          item.primaryReason.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }

  public async getStats(): Promise<InspectionStats> {
    const records = await this.getRecentInspections(5000);
    let totalOk = 0;
    let totalNg = 0;
    let totalErrors = 0;
    let totalCycleSum = 0;

    for (const record of records) {
      if (record.judgement === 'OK') totalOk++;
      else if (record.judgement === 'NG') totalNg++;
      else totalErrors++;
      totalCycleSum += record.metrics?.totalCycleMs || 0;
    }

    const totalInspected = records.length;
    return {
      totalInspected,
      totalOk,
      totalNg,
      totalErrors,
      yieldRate: totalInspected > 0 ? (totalOk / totalInspected) * 100 : 100,
      lastCycleTimeMs: records[0]?.metrics?.totalCycleMs || 0,
      averageCycleTimeMs: totalInspected > 0 ? Math.round(totalCycleSum / totalInspected) : 0,
    };
  }

  public async clearInspectionHistory(): Promise<void> {
    // Explicit non-null filter keeps this operation compatible with PostgREST
    // and makes the destructive intent obvious.
    await this.request('?id=not.is.null', {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  public async getPendingSyncCount(): Promise<number> {
    return 0;
  }

  public async flushSyncQueue(): Promise<{ synced: number }> {
    return { synced: 0 };
  }
}

export const dbService = new DatabaseService();
