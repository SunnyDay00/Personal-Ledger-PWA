import { db, dbAPI } from './db';
import { generateId } from '../utils';
import { FIXED_SYNC_ENDPOINT } from '../constants';

const DEFAULT_CACHE_LIMIT = 200 * 1024 * 1024; // 200MB

export const imageService = {
  async uploadImage(blob: Blob): Promise<string> {
    const key = generateId();
    return this.uploadImageWithKey(key, blob);
  },

  async uploadImageWithKey(key: string, blob: Blob, timeoutMs: number = 20000): Promise<string> {
      const settings = await dbAPI.getSettings();
      const token = settings?.authMode === 'authenticated' ? settings.authSession?.token : undefined;
  
      if (!token) {
        throw new Error("请先登录账号后同步图片");
      }
  
      const workerUrl = FIXED_SYNC_ENDPOINT.replace(/\/$/, '');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${workerUrl}/upload/image`, {
          method: 'POST',
          headers: {
            'Content-Type': blob.type,
            'Authorization': `Bearer ${token}`,
            'X-Image-Key': key
          },
          body: blob,
          signal: controller.signal
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Upload failed: ${res.status} ${text}`);
        }

        const data = await res.json();
        const finalKey = data.key;

        await this.cacheImage(finalKey, blob);

        return finalKey;
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          throw new Error(`Image upload timed out after ${timeoutMs}ms`);
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
  },

  async deleteRemoteImage(key: string): Promise<void> {
    const settings = await dbAPI.getSettings();
    const token = settings?.authMode === 'authenticated' ? settings.authSession?.token : undefined;

    if (!token) {
        console.warn("Skipping remote delete: not authenticated");
        return;
    }

    const workerUrl = FIXED_SYNC_ENDPOINT.replace(/\/$/, '');
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

  async syncPendingImages(imageKeys?: string[]): Promise<number> {
      const scopedKeys = imageKeys
          ? Array.from(new Set(imageKeys.filter(key => typeof key === 'string' && key.trim() !== '')))
          : undefined;
      if (scopedKeys && scopedKeys.length === 0) return 0;

      const pending = scopedKeys
          ? (await db.pending_uploads.bulkGet(scopedKeys)).filter(Boolean) as { key: string; blob: Blob; createdAt: number }[]
          : await db.pending_uploads.toArray();
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
    const token = settings?.authMode === 'authenticated' ? settings.authSession?.token : undefined;

    if (!token) throw new Error("请先登录账号后下载云端图片");

    const workerUrl = FIXED_SYNC_ENDPOINT.replace(/\/$/, '');
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
