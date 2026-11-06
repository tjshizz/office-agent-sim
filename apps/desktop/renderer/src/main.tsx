import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HostPayload, WorldSnapshot } from "@office-sim/shared";
import { createGame } from "@office-sim/game";
import { AppShell, useOfficeStore } from "@office-sim/ui";
import "../../../../packages/ui/src/styles.css";

const GAME_HOST = "phaser-root";
const SERVER_URL =
  (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
    .VITE_OFFICE_SERVER_URL || "";

type OfficeClient = {
  getSnapshot: () => Promise<WorldSnapshot>;
  sendCommand: (cmd: unknown) => void;
  onSnapshot: (cb: (snap: WorldSnapshot) => void) => () => void;
  onStream: (cb: (payload: unknown) => void) => () => void;
  onServerMeta?: (cb: (meta: HostPayload["server"]) => void) => () => void;
};

function createRemoteClient(baseUrl: string): OfficeClient {
  const base = baseUrl.replace(/\/$/, "");
  const snapshotListeners = new Set<(snap: WorldSnapshot) => void>();
  const streamListeners = new Set<(payload: unknown) => void>();
  const metaListeners = new Set<(meta: HostPayload["server"]) => void>();
  let last: WorldSnapshot | null = null;

  const esSnap = new EventSource(`${base}/api/events`);
  esSnap.addEventListener("snapshot", (evt) => {
    try {
      const payload = JSON.parse((evt as MessageEvent).data) as HostPayload;
      last = payload.snapshot;
      for (const cb of snapshotListeners) cb(payload.snapshot);
      for (const cb of metaListeners) cb(payload.server);
    } catch {
      // ignore
    }
  });

  const esStream = new EventSource(`${base}/api/stream`);
  esStream.addEventListener("stream", (evt) => {
    try {
      const payload = JSON.parse((evt as MessageEvent).data) as unknown;
      for (const cb of streamListeners) cb(payload);
    } catch {
      // ignore
    }
  });

  return {
    getSnapshot: async () => {
      if (last) return last;
      const res = await fetch(`${base}/api/snapshot`);
      const payload = (await res.json()) as HostPayload;
      last = payload.snapshot;
      for (const cb of metaListeners) cb(payload.server);
      return payload.snapshot;
    },
    sendCommand: (cmd) => {
      void fetch(`${base}/api/command`, {
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
}

function createLocalClient(): OfficeClient {
  return {
    getSnapshot: () => window.office.getSnapshot(),
    sendCommand: (cmd) => window.office.sendCommand(cmd),
    onSnapshot: (cb) => window.office.onSnapshot(cb),
    onStream: (cb) => window.office.onStream(cb),
  };
}

function Root({ office }: { office: OfficeClient }) {
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const setSnapshot = useOfficeStore((s) => s.setSnapshot);
  const setStream = useOfficeStore((s) => s.setStream);
  const setServerMeta = useOfficeStore((s) => s.setServerMeta);
  const appendStreamToken = useOfficeStore((s) => s.appendStreamToken);
  const addToolNote = useOfficeStore((s) => s.addToolNote);

  useEffect(() => {
    const host = document.getElementById(GAME_HOST);
    if (!host || gameRef.current) return;

    const created = createGame(host, {
      onAgentClick: (agentId) => {
        office.sendCommand({ type: "join", agentId });
      },
    });
    gameRef.current = created;

    const offSnap = office.onSnapshot((snap) => {
      setSnapshot(snap);
      created.scene.applySnapshot(snap);
    });

    const offStream = office.onStream((payload) => {
      const p = payload as {
        type: string;
        conversationId?: string;
        generation?: number;
        token?: string;
        speakerId?: string;
        note?: string;
      };
      if (p.type === "start" && p.conversationId) {
        setStream({
          conversationId: p.conversationId,
          generation: p.generation ?? 0,
          text: "",
          speakerId: p.speakerId,
          toolNotes: [],
        });
      } else if (p.type === "token" && p.token) {
        appendStreamToken(p.token);
      } else if (p.type === "tool" && p.note) {
        addToolNote(p.note);
      } else if (p.type === "done") {
        setStream(null);
      }
    });

    const offMeta = office.onServerMeta?.((meta) => setServerMeta(meta));

    void office.getSnapshot().then((snap) => {
      setSnapshot(snap);
      setTimeout(() => created.scene.applySnapshot(snap), 100);
    });

    return () => {
      offSnap();
      offStream();
      offMeta?.();
      created.game.destroy(true);
      gameRef.current = null;
    };
  }, [addToolNote, appendStreamToken, office, setServerMeta, setSnapshot, setStream]);

  return (
    <AppShell
      gameHostId={GAME_HOST}
      bridge={{
        sendCommand: (cmd) => office.sendCommand(cmd),
      }}
    />
  );
}

function Boot() {
  const [office, setOffice] = useState<OfficeClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (SERVER_URL) {
        try {
          const res = await fetch(`${SERVER_URL.replace(/\/$/, "")}/api/health`);
          if (!res.ok) throw new Error(`Server health ${res.status}`);
          if (cancelled) return;
          setOffice(createRemoteClient(SERVER_URL));
          return;
        } catch (err) {
          if (cancelled) return;
          setError(
            `Could not reach OFFICE_SERVER_URL (${SERVER_URL}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return;
        }
      }
      if (cancelled) return;
      setOffice(createLocalClient());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#e8eef8" }}>
        {error}
      </div>
    );
  }
  if (!office) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#8b97ab" }}>
        Connecting…
      </div>
    );
  }
  return <Root office={office} />;
}

createRoot(document.getElementById("root")!).render(<Boot />);
