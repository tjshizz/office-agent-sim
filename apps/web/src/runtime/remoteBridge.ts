import { overlayCanonicalSouls, type HostPayload, type WorldSnapshot } from "@office-sim/shared";
import type { OfficeApi } from "./bridge";

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

export function createRemoteOfficeBridge(serverUrl: string): OfficeApi {
  const base = serverUrl.replace(/\/$/, "");
  const snapshotListeners = new Set<(snap: WorldSnapshot) => void>();
  const streamListeners = new Set<(payload: unknown) => void>();
  const metaListeners = new Set<(payload: HostPayload["server"]) => void>();

  let lastSnapshot: WorldSnapshot | null = null;
  let esSnap: EventSource | null = null;
  let esStream: EventSource | null = null;

  const emitSnap = (snap: WorldSnapshot) => {
    const next = overlayCanonicalSouls(snap);
    lastSnapshot = next;
    for (const cb of snapshotListeners) cb(next);
  };

  const connect = () => {
    esSnap?.close();
    esStream?.close();

    esSnap = new EventSource(joinUrl(base, "/api/events"));
    esSnap.addEventListener("snapshot", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as HostPayload;
        emitSnap(payload.snapshot);
        for (const cb of metaListeners) cb(payload.server);
      } catch {
        // ignore malformed
      }
    });
    esSnap.onerror = () => {
      // browser will retry EventSource automatically
    };

    esStream = new EventSource(joinUrl(base, "/api/stream"));
    esStream.addEventListener("stream", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as unknown;
        for (const cb of streamListeners) cb(payload);
      } catch {
        // ignore
      }
    });
  };

  connect();

  const api: OfficeApi & {
    onServerMeta: (cb: (meta: HostPayload["server"]) => void) => () => void;
  } = {
    getSnapshot: async () => {
      if (lastSnapshot) return lastSnapshot;
      const res = await fetch(joinUrl(base, "/api/snapshot"));
      const payload = (await res.json()) as HostPayload;
      emitSnap(payload.snapshot);
      for (const cb of metaListeners) cb(payload.server);
      return payload.snapshot;
    },
    sendCommand: (cmd) => {
      void fetch(joinUrl(base, "/api/command"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cmd),
      });
    },
    onSnapshot: (cb) => {
      snapshotListeners.add(cb);
      return () => snapshotListeners.delete(cb);
    },
    onStream: (cb) => {
      streamListeners.add(cb);
      return () => streamListeners.delete(cb);
    },
    onServerMeta: (cb) => {
      metaListeners.add(cb);
      return () => metaListeners.delete(cb);
    },
  };

  return api;
}

export async function probeServer(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetch(joinUrl(serverUrl, "/api/health"), {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
