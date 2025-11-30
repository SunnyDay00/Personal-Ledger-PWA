
import { db, ensureStoresReady, resetDB } from './db';
import { WebDAVService } from './webdav';
import { AppSettings, Ledger, Transaction, Category, CategoryGroup } from '../types';
import { transactionsToCsv, parseCsvToTransactions } from '../utils';

// Helper: Get Year from Timestamp
const getYear = (ts: number) => new Date(ts).getFullYear();

export class SyncService {
    private webdav: WebDAVService;
    // Cache ETags during Pull to use during Push
    private etagCache: Map<string, string> = new Map();
    // Cache downloaded content to skip upload if unchanged
    private contentCache: Map<string, string> = new Map();

    constructor(settings: AppSettings) {
        this.webdav = new WebDAVService(settings);
    }

    async checkConnection() {
        return await this.webdav.checkConnection();
    }

    /**
     * The Robust Sync Workflow
     * Retry Loop -> Pull (List & Download Split Files) -> Merge -> Push (Upload Split Files with Optimistic Lock)
     */
    async performSync() {
        let attempt = 0;
        const MAX_CONFLICT_RETRIES = 3;
        // 确认表存在，否则重建一次
        let ready = await ensureStoresReady();
        if (!ready) {
            await resetDB();
            ready = await ensureStoresReady();
        }
        let hasGroupStore = ready && db.tables.some(t => (t as any).name === 'categoryGroups');
        if (hasGroupStore) {
            try {
                await db.categoryGroups.count();
            } catch {
                // 当前数据库里缺少该表，降级为无分组模式，避免 objectStore not found
                hasGroupStore = false;
            }
        }

        while (true) {
            try {
                this.etagCache.clear();
                this.contentCache.clear();

                // === STEP 1: PULL ===
                await this.pullAndMerge(hasGroupStore);

                // === STEP 2: PUSH ===
                await this.pushChanges(hasGroupStore);
                
                // If successful, break loop
                break;

            } catch (e: any) {
                if (e.message === 'SyncConflict') {
                    attempt++;
                    if (attempt <= MAX_CONFLICT_RETRIES) {
                        console.warn(`Sync Conflict detected (412). Retrying attempt ${attempt}...`);
                        // Random backoff 500ms - 1500ms
                        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
                        continue;
                    } else {
                        throw new Error("同步冲突：云端数据变化频繁，请稍后重试。");
                    }
                }
                throw e; // Rethrow other errors
            }
        }
    }

    private async pullAndMerge(hasGroupStore: boolean) {
        // 1. Discover all files
        const files = await this.webdav.listFiles('/');
        
        // Helper to find file in list
        const findFile = (name: string) => files.find(f => f.filename === name);

        // A. Ledgers
        const ledgersFile = findFile('ledgers.json');
        if (ledgersFile) {
            try {
                const { text, etag } = await this.webdav.getFile('ledgers.json');
                if (etag) this.etagCache.set('ledgers.json', etag);
                this.contentCache.set('ledgers.json', text);
                
                const cloudLedgers: Ledger[] = JSON.parse(text);
                await this.mergeLedgers(cloudLedgers);
            } catch (e) { console.warn("Failed to pull ledgers.json", e); }
        }

        // B. Settings
        const settingsFile = findFile('settings.json');
        if (settingsFile) {
            try {
                const { text, etag } = await this.webdav.getFile('settings.json');
                if (etag) this.etagCache.set('settings.json', etag);
                this.contentCache.set('settings.json', text);

                const cloudSettingsData = JSON.parse(text);
                if (cloudSettingsData.categories) {
                    await this.mergeCategories(cloudSettingsData.categories);
                }
                if (hasGroupStore && cloudSettingsData.categoryGroups) {
                    await this.mergeCategoryGroups(cloudSettingsData.categoryGroups);
                }
            } catch (e) { console.warn("Failed to pull settings.json", e); }
        }

        // C. Transactions (Support Split Files & Legacy)
        // IMPORTANT: re-read ledgers AFTER merge so we have cloud-ledger IDs when local was empty
        const localLedgers = await db.ledgers.toArray();

        // 额外收集云端文件中的 ledgerId，避免本地无账本时漏拉分年文件
        const ledgerIdsFromFiles = new Set<string>();
        for (const f of files) {
            // legacy: ledger_{id}.csv
            const legacyMatch = /^ledger_(.+)\.csv$/i.exec(f.filename);
            if (legacyMatch) ledgerIdsFromFiles.add(legacyMatch[1]);

            // split: ledger_{id}_{year}.csv
            const splitMatch = /^ledger_(.+)_(\d{4})\.csv$/i.exec(f.filename);
            if (splitMatch) ledgerIdsFromFiles.add(splitMatch[1]);
        }

        const ledgerIdsToProcess = new Set<string>([...localLedgers.map(l => l.id), ...Array.from(ledgerIdsFromFiles)]);

        for (const ledgerId of ledgerIdsToProcess) {
            // Pattern 1: Legacy "ledger_{id}.csv"
            const legacyName = `ledger_${ledgerId}.csv`;
            const legacyFile = findFile(legacyName);
            
            // Pattern 2: Split "ledger_{id}_{year}.csv"
            // Find all files that start with ledger_{id}_ and end with .csv
            const splitPrefix = `ledger_${ledgerId}_`;
            const splitFiles = files.filter(f => f.filename.startsWith(splitPrefix) && f.filename.endsWith('.csv') && f.filename !== legacyName);

            // Process Legacy if exists (Migration)
            if (legacyFile) {
                try {
                    const { text } = await this.webdav.getFile(legacyName);
                    // We don't cache etag for legacy because we intend to replace it with split files on push
                    const txs = parseCsvToTransactions(text);
                    await this.mergeTransactions(txs);
                } catch (e) { console.warn(`Failed to pull ${legacyName}`, e); }
            }

            // Process Split Files
            for (const f of splitFiles) {
                try {
                    const { text, etag } = await this.webdav.getFile(f.filename);
                    if (etag) this.etagCache.set(f.filename, etag);
                    this.contentCache.set(f.filename, text);

                    const txs = parseCsvToTransactions(text);
                    await this.mergeTransactions(txs);
                } catch (e) { console.warn(`Failed to pull ${f.filename}`, e); }
            }
        }
    }

    private async pushChanges(hasGroupStore: boolean) {
        // A. Ledgers (Full list)
        const allLedgers = await db.ledgers.toArray();
        const validLedgers = allLedgers.filter(l => !l.isDeleted);
        const ledgersJson = JSON.stringify(validLedgers, null, 2);
        
        await this.smartUpload('ledgers.json', ledgersJson);

        // B. Settings & Categories
        const currentSettings = await db.settings.get('main');
        const allCats = await db.categories.toArray();
        const validCats = allCats.filter(c => !c.isDeleted).sort((a,b) => a.order - b.order);
        const allGroups = hasGroupStore ? await db.categoryGroups.toArray() : [];
        const validGroups = allGroups.filter(g => !g.isDeleted).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
        
        const settingsPayload = {
            settings: currentSettings?.value,
            categories: validCats,
            categoryGroups: hasGroupStore ? validGroups : undefined,
            operationLogs: [] 
        };
        const settingsJson = JSON.stringify(settingsPayload, null, 2);
        await this.smartUpload('settings.json', settingsJson);

        // C. Transactions (Split by Year)
        // Group *ALL* transactions (including deleted) by Ledger and Year
        const allTxs = await db.transactions.toArray();
        
        // Map: LedgerID -> Year -> Txs[]
        const map: Record<string, Record<number, Transaction[]>> = {};

        for (const t of allTxs) {
            const year = getYear(t.date);
            if (!map[t.ledgerId]) map[t.ledgerId] = {};
            if (!map[t.ledgerId][year]) map[t.ledgerId][year] = [];
            map[t.ledgerId][year].push(t);
        }

        // Upload loop
        // Iterate over valid ledgers to ensure we sync their data
        // Also check if we have orphan data in map? (Maybe from deleted ledgers, we can skip or sync)
        // Let's iterate keys in map to be safe.
        for (const ledgerId of Object.keys(map)) {
            const years = map[ledgerId];
            for (const yearStr of Object.keys(years)) {
                const year = parseInt(yearStr);
                const txs = years[year];
                
                if (txs.length === 0) continue;

                const filename = `ledger_${ledgerId}_${year}.csv`;
                
                // NOTE: We pass ALL known categories/ledgers to helper, just for name resolution in CSV comments
                // The crucial part is the ID fields.
                const csv = transactionsToCsv(txs, validCats, validLedgers);
                
                // Upload with BOM for Excel
                await this.smartUpload(filename, '\uFEFF' + csv);
            }
        }
    }

    /**
     * Uploads file ONLY if content changed or if it's new.
     * Uses ETag for concurrency check.
     */
    private async smartUpload(filename: string, content: string) {
        const cachedContent = this.contentCache.get(filename);
        const cachedEtag = this.etagCache.get(filename);

        // 1. Content Check: If we downloaded it recently and content is identical, skip upload.
        // This saves bandwidth for historical years that rarely change.
        if (cachedContent && cachedContent === content) {
            // console.log(`Skipping ${filename} - Content unchanged`);
            return;
        }

        // 2. Upload with Optimistic Lock
        // If we have an ETag, pass it. If server ETag differs, it throws SyncConflict (412).
        // If we don't have an ETag (new file), pass undefined (create).
        await this.webdav.putFile(filename, content, cachedEtag);
    }

    // --- Merge Logic (Same as before) ---

    private async mergeLedgers(cloudLedgers: Ledger[]) {
        await (db as any).transaction('rw', db.ledgers, async () => {
            for (const cloudL of cloudLedgers) {
                const localL = await db.ledgers.get(cloudL.id);
                if (!localL) {
                    await db.ledgers.put({ ...cloudL, updatedAt: cloudL.updatedAt || Date.now(), isDeleted: false });
                } else {
                    const cloudTime = cloudL.updatedAt || 0;
                    const localTime = localL.updatedAt || 0;
                    if (cloudTime > localTime) {
                        await db.ledgers.put({ ...cloudL, updatedAt: cloudTime });
                    }
                }
            }
        });
    }

    private async mergeCategories(cloudCats: Category[]) {
         await (db as any).transaction('rw', db.categories, async () => {
            for (const cloudC of cloudCats) {
                const localC = await db.categories.get(cloudC.id);
                if (!localC) {
                    await db.categories.put({ ...cloudC, updatedAt: cloudC.updatedAt || Date.now(), isDeleted: false });
                } else {
                     const cloudTime = cloudC.updatedAt || 0;
                     const localTime = localC.updatedAt || 0;
                     if (cloudTime > localTime) {
                         await db.categories.put({ ...cloudC, updatedAt: cloudTime });
                     }
                }
            }
        });
    }

    private async mergeCategoryGroups(cloudGroups: CategoryGroup[]) {
        const hasGroupStore = db.tables.some(t => (t as any).name === 'categoryGroups');
        if (!hasGroupStore) return;
        await (db as any).transaction('rw', db.categoryGroups, async () => {
            for (const g of cloudGroups) {
                const localG = await db.categoryGroups.get(g.id);
                if (!localG) {
                    await db.categoryGroups.put({ ...g, updatedAt: g.updatedAt || Date.now(), isDeleted: false });
                } else {
                    const cloudTime = g.updatedAt || 0;
                    const localTime = localG.updatedAt || 0;
                    if (cloudTime > localTime) {
                        await db.categoryGroups.put({ ...g, updatedAt: cloudTime });
                    }
                }
            }
        });
    }

    private async mergeTransactions(cloudTxs: Transaction[]) {
        if (cloudTxs.length === 0) return;
        
        await (db as any).transaction('rw', db.transactions, async () => {
            for (const cloudT of cloudTxs) {
                const localT = await db.transactions.get(cloudT.id);
                if (!localT) {
                    await db.transactions.put({ ...cloudT, updatedAt: cloudT.updatedAt || cloudT.createdAt || Date.now() });
                    continue;
                }
                const cloudTime = cloudT.updatedAt || cloudT.createdAt || 0;
                const localTime = localT.updatedAt || localT.createdAt || 0;
                if (cloudTime > localTime) {
                    await db.transactions.put(cloudT);
                }
            }
        });
    }
}
