import { safeStorage } from "electron";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class KeyStore {
  private path: string;

  constructor(userDataPath: string) {
    this.path = join(userDataPath, "xai.key");
  }

  save(key: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      writeFileSync(this.path, key, "utf8");
      return;
    }
    const buf = safeStorage.encryptString(key);
    writeFileSync(this.path, buf);
  }

  load(): string | null {
    if (!existsSync(this.path)) return null;
    const raw = readFileSync(this.path);
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(raw);
      }
      return raw.toString("utf8");
    } catch {
      return null;
    }
  }

  clear(): void {
    if (existsSync(this.path)) unlinkSync(this.path);
  }
}
