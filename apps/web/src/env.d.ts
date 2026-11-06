import type { OfficeApi } from "./runtime/bridge";

declare global {
  interface Window {
    office: OfficeApi;
  }
}

export {};
