import { db, dbAPI } from './db';
import { generateId } from '../utils';

const DEFAULT_CACHE_LIMIT = 200 * 1024 * 1024; // 200MB

export const imageService = {
  // ... uploadImage (keep existing logic or copy it here if I replace whole file) ...
  // Wait, I am using replace_file_content, so I need to be careful.
  // I will assume uploadImage is fine. I will rewrite fetchImageBlob and add helper methods.

  async uploadImage(blob: Blob): Promise<string> {
    // Legacy direct upload method, keeping for reference or explicit sync
    const key = generateId(); // Use client ID
    return this.uploadImageWithKey(key, blob);
  },

  async uploadImageWithKey(key: string, blob: Blob): Promise<string> {
      const settings = await dbAPI.getSettings();
      const endpoint = settings?.syncEndpoint;
      const token = settings?.syncToken;
  
      if (!endpoint || !token) {
        throw new Error("请先配置云端同步信息 (Endpoint/Token)");
      }
  
      const workerUrl = endpoint.replace(/\/$/, '');
      
      // Upload with PUT to specify key (or POST if Worker updated to accept key, but currently Worker generates random UUID)
      // WORKER CHANGE REQUIRED: We need Worker to accept a key, OR strictly use client-generated keys.
      // Current Worker: const key = crypto.randomUUID(); -> It ignores client key.
      // PROBLEM: To support offline, we MUST generate key on client.
      // SOLUTION: We will change `uploadImage` to use `PUT /image/:key` if we want to force key, OR `POST` with a header?
      // Actually, standard R2 / Worker pattern often allows PUT. 
      // Let's assume for this "Offline" feature we will rely on a new Worker endpoint or modification to POST logic?
      // NO, simpler: The Client generates UUID. The Worker *should* accept it.
      // But currently Worker lines 176-180: const key = crypto.randomUUID();
      // I MUST UPDATE WORKER.JS FIRST to accept key from header or URL.
      
      // Let's use a custom header 'X-Image-Key' for the POST request to hint the key.
      
      const res = await fetch(`${workerUrl}/upload/image`, {
        method: 'POST',
        headers: {
          'Content-Type': blob.type,
          'Authorization': `Bearer ${token}`,
          'X-Image-Key': key
        },
        body: blob
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }
  
      const data = await res.json();
      const finalKey = data.key; // Should match our key if Worker updated
      
      // Cache locally
      await this.cacheImage(finalKey, blob);
      
      return finalKey;
  },

  async deleteRemoteImage(key: string): Promise<void> {
    const settings = await dbAPI.getSettings();
    const endpoint = settings?.syncEndpoint;
    const token = settings?.syncToken;

    if (!endpoint || !token) {
        console.warn("Skipping remote delete: No sync config");
        return;
    }

    const workerUrl = endpoint.replace(/\/$/, '');
    try {
        const res = await fetch(`${workerUrl}/image/${key}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            console.warn(`Remote delete failed: ${res.status}`);
        }
    } catch (e) {
        console.warn("Remote delete network error", e);
    }
  },

  async deleteLocalImage(key: string): Promise<void> {
      await db.images.delete(key);
      await db.pending_uploads.delete(key);
  },

  async saveLocalImage(blob: Blob): Promise<string> {
      const key = generateId(); // UUID
      // Save to cache (for display)
      await this.cacheImage(key, blob);
      // Save to pending queue (for sync)
      await db.pending_uploads.put({ key, blob, createdAt: Date.now() });
      return key;
  },

  async syncPendingImages(): Promise<number> {
      const pending = await db.pending_uploads.toArray();
      if (pending.length === 0) return 0;

      let successCount = 0;
      for (const item of pending) {
          try {
              await this.uploadImageWithKey(item.key, item.blob);
              await db.pending_uploads.delete(item.key);
              successCount++;
          } catch (e) {
              console.warn(`Failed to sync image ${item.key}:`, e);
              // Keep in queue to retry later
          }
      }
      return successCount;
  },

  getImageUrl(key: string): string {
    return key;
  },

  async fetchImageBlob(key: string): Promise<Blob> {
    // 1. Check Cache
    const cached = await db.images.get(key);
    if (cached && cached.blob && cached.blob.size > 0) {
      // Async update lastAccess (don't await to block UI)
      db.images.update(key, { lastAccess: Date.now() }).catch(console.error);
      return cached.blob;
    }

    // 2. Fetch Remote
    const settings = await dbAPI.getSettings();
    const endpoint = settings?.syncEndpoint;
    const token = settings?.syncToken;

    if (!endpoint || !token) throw new Error("Missing sync config");

    const workerUrl = endpoint.replace(/\/$/, '');
    const res = await fetch(`${workerUrl}/image/${key}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Image download failed");
    const blob = await res.blob();

    if (blob.size === 0) throw new Error("Fetched empty blob");

    // 3. Cache it
    await this.cacheImage(key, blob);

    return blob;
  },

  async cacheImage(key: string, blob: Blob) {
    try {
        if (!blob || blob.size === 0) return;
        const size = blob.size;
        await db.images.put({ key, blob, size, lastAccess: Date.now() });
        // Don't enforce limit on every write to avoid blocking UI with heavy reads
        // await this.enforceCacheLimit(); 
    } catch(e) {
        console.warn("Cache write failed", e);
    }
  },

  async enforceCacheLimit() {
      const settings = await dbAPI.getSettings();
      const limit = settings?.imageCacheLimit || DEFAULT_CACHE_LIMIT;

      // Get all items size and key ordered by lastAccess (oldest first)
      const items = await db.images.orderBy('lastAccess').toArray();
      let currentSize = items.reduce((sum, item) => sum + item.size, 0);

      if (currentSize <= limit) return;

      const toDelete: string[] = [];
      for (const item of items) {
          if (currentSize <= limit) break;
          toDelete.push(item.key);
          currentSize -= item.size;
      }

      if (toDelete.length > 0) {
          await db.images.bulkDelete(toDelete);
          // console.log(`Evicted ${toDelete.length} images from cache`);
      }
  },

  async clearCache() {
      await db.images.clear();
  },

  async getCacheStats() {
      const count = await db.images.count();
      const items = await db.images.toArray();
      const size = items.reduce((s, i) => s + i.size, 0);
      return { count, size };
  }
};
