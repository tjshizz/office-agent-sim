import type {
  AgentState,
  Conversation,
  MemoryFact,
  Relationship,
  TokenUsage,
} from "@office-sim/shared";

export type PersistedWorld = {
  simMs: number;
  agents: AgentState[];
  conversations: Conversation[];
  memories: MemoryFact[];
  relationships: Relationship[];
  tokens: TokenUsage;
};

const DB_NAME = "office-sim";
const STORE = "world";
const RECORD_ID = "blob";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export class WebOfficeDb {
  private ready: Promise<void>;
  private db: IDBDatabase | null = null;

  constructor() {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    this.db = await openDb();
  }

  async ensureReady(): Promise<void> {
    await this.ready;
  }

  async saveWorld(world: PersistedWorld): Promise<void> {
    await this.ensureReady();
    if (!this.db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(world, RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB save failed"));
    });
  }

  async loadWorld(): Promise<PersistedWorld | null> {
    await this.ensureReady();
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_ID);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value ? (value as PersistedWorld) : null);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB load failed"));
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
