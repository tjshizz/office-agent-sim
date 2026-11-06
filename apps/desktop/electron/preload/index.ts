import { contextBridge, ipcRenderer } from "electron";
import type { WorldSnapshot } from "@office-sim/shared";

export type OfficeApi = {
  getSnapshot: () => Promise<WorldSnapshot>;
  sendCommand: (cmd: unknown) => void;
  onSnapshot: (cb: (snap: WorldSnapshot) => void) => () => void;
  onStream: (cb: (payload: unknown) => void) => () => void;
};

const api: OfficeApi = {
  getSnapshot: () => ipcRenderer.invoke("office:getSnapshot") as Promise<WorldSnapshot>,
  sendCommand: (cmd) => {
    ipcRenderer.send("office:command", cmd);
  },
  onSnapshot: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, snap: WorldSnapshot) => cb(snap);
    ipcRenderer.on("office:snapshot", listener);
    return () => ipcRenderer.removeListener("office:snapshot", listener);
  },
  onStream: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on("office:stream", listener);
    return () => ipcRenderer.removeListener("office:stream", listener);
  },
};

contextBridge.exposeInMainWorld("office", api);
