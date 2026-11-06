import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
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

function resolveWasm(): string {
  const req = createRequire(__filename);
  try {
    return req.resolve("sql.js/dist/sql-wasm.wasm");
  } catch {
    const fallbacks = [
      join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"),
      join(process.cwd(), "apps/desktop/node_modules/sql.js/dist/sql-wasm.wasm"),
      join(dirname(__filename), "../../../node_modules/sql.js/dist/sql-wasm.wasm"),
    ];
    for (const p of fallbacks) {
      if (existsSync(p)) return p;
    }
    throw new Error("Could not resolve sql.js wasm");
  }
}

export class OfficeDb {
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private path: string;
  private ready: Promise<void>;

  constructor(userDataPath: string) {
    this.path = join(userDataPath, "office.sqlite");
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const wasmPath = resolveWasm();
    this.SQL = await initSqlJs({
      locateFile: () => wasmPath,
    });
    if (existsSync(this.path)) {
      const fileBuffer = readFileSync(this.path);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }
    this.db.run(`
      CREATE TABLE IF NOT EXISTS world_blob (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL
      );
    `);
  }

  async ensureReady(): Promise<void> {
    await this.ready;
  }

  saveWorld(world: PersistedWorld): void {
    if (!this.db) return;
    this.db.run(`DELETE FROM world_blob WHERE id = 1`);
    this.db.run(`INSERT INTO world_blob (id, json) VALUES (1, ?)`, [
      JSON.stringify(world),
    ]);
    const data = this.db.export();
    writeFileSync(this.path, Buffer.from(data));
  }

  loadWorld(): PersistedWorld | null {
    if (!this.db) return null;
    const result = this.db.exec(`SELECT json FROM world_blob WHERE id = 1`);
    const value = result[0]?.values?.[0]?.[0];
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value) as PersistedWorld;
    } catch {
      return null;
    }
  }

  close(): void {
    if (this.db) {
      const data = this.db.export();
      writeFileSync(this.path, Buffer.from(data));
      this.db.close();
    }
  }
}
