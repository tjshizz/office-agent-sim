import type { OfficeApi } from "../../electron/preload/index";

declare global {
  interface Window {
    office: OfficeApi;
  }
}

export {};
