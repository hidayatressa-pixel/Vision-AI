/**
 * IndexedDB Database Service for Realtime Vision Inspection
 * Provides offline-first asynchronous persistence, query, and sync queue.
 */

import { InspectionRecord, InspectionStats } from '../types/inspection';
import { MasterProduct } from '../types/master';

const DB_NAME = 'vision_inspection_db';
const DB_VERSION = 1;

class DatabaseService {
  private db: IDBDatabase | null = null;
  private dbInitPromise: Promise<IDBDatabase> | null = null;

  public async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbInitPromise) return this.dbInitPromise;

    this.dbInitPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Inspection results store
        if (!db.objectStoreNames.contains('inspections')) {
          const inspStore = db.createObjectStore('inspections', { keyPath: 'id' });
          inspStore.createIndex('timestamp', 'timestamp', { unique: false });
          inspStore.createIndex('productId', 'productId', { unique: false });
          inspStore.createIndex('judgement', 'judgement', { unique: false });
          inspStore.createIndex('syncedToCloud', 'syncedToCloud', { unique: false });
        }

        // Master products store
        if (!db.objectStoreNames.contains('masters')) {
          const masterStore = db.createObjectStore('masters', { keyPath: 'id' });
          masterStore.createIndex('productCode', 'productCode', { unique: true });
        }

        // Offline sync queue
        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbInitPromise;
  }

  // --- Master Operations ---

  public async getAllMasters(): Promise<MasterProduct[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('masters', 'readonly');
      const store = tx.objectStore('masters');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async getMasterById(id: string): Promise<MasterProduct | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('masters', 'readonly');
      const store = tx.objectStore('masters');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async saveMaster(master: MasterProduct): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('masters', 'readwrite');
      const store = tx.objectStore('masters');
      const req = store.put(master);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Inspection Result Operations ---

  public async saveInspectionRecord(record: InspectionRecord): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['inspections', 'sync_queue'], 'readwrite');
      const inspStore = tx.objectStore('inspections');
      const queueStore = tx.objectStore('sync_queue');

      inspStore.put(record);

      if (!record.syncedToCloud) {
        queueStore.add({
          inspectionId: record.id,
          timestamp: record.timestamp,
          payload: record,
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getRecentInspections(limit = 100): Promise<InspectionRecord[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('inspections', 'readonly');
      const store = tx.objectStore('inspections');
      const index = store.index('timestamp');
      const req = index.openCursor(null, 'prev');
      const results: InspectionRecord[] = [];

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      req.onerror = () => reject(req.error);
    });
  }

  public async getFilteredInspections(filters: {
    productId?: string;
    judgement?: string;
    search?: string;
    limit?: number;
  }): Promise<InspectionRecord[]> {
    const all = await this.getRecentInspections(filters.limit || 200);
    return all.filter((item) => {
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
    const records = await this.getRecentInspections(1000);
    let totalOk = 0;
    let totalNg = 0;
    let totalErrors = 0;
    let totalCycleSum = 0;

    for (const r of records) {
      if (r.judgement === 'OK') totalOk++;
      else if (r.judgement === 'NG') totalNg++;
      else totalErrors++;

      totalCycleSum += r.metrics?.totalCycleMs || 0;
    }

    const totalInspected = records.length;
    const yieldRate = totalInspected > 0 ? (totalOk / totalInspected) * 100 : 100;
    const lastCycleTimeMs = records[0]?.metrics?.totalCycleMs || 0;
    const averageCycleTimeMs = totalInspected > 0 ? Math.round(totalCycleSum / totalInspected) : 0;

    return {
      totalInspected,
      totalOk,
      totalNg,
      totalErrors,
      yieldRate,
      lastCycleTimeMs,
      averageCycleTimeMs,
    };
  }

  public async clearInspectionHistory(): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['inspections', 'sync_queue'], 'readwrite');
      tx.objectStore('inspections').clear();
      tx.objectStore('sync_queue').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getPendingSyncCount(): Promise<number> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public async flushSyncQueue(): Promise<{ synced: number }> {
    const db = await this.getDb();
    const queueItems = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readonly');
      const req = tx.objectStore('sync_queue').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (queueItems.length === 0) return { synced: 0 };

    // Never delete a local record merely because an endpoint was attempted.
    // A real deployment must expose POST /api/inspections/sync and return 2xx.
    const endpoint = '/api/inspections/sync';
    let synced = 0;

    for (const item of queueItems) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) continue;

        const tx = db.transaction(['inspections', 'sync_queue'], 'readwrite');
        tx.objectStore('inspections').put({ ...item.payload, syncedToCloud: true });
        tx.objectStore('sync_queue').delete(item.id);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        synced++;
      } catch {
        // Keep the item queued for the next retry.
      }
    }

    return { synced };
  }
}

export const dbService = new DatabaseService();
