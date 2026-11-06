const STORAGE_KEY = "office-sim:xai-key";

export class WebKeyStore {
  save(key: string): void {
    localStorage.setItem(STORAGE_KEY, key);
  }

  load(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
