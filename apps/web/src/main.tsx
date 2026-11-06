import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createGame } from "@office-sim/game";
import { AppShell, useOfficeStore } from "@office-sim/ui";
import "../../../packages/ui/src/styles.css";
import { createOfficeBridge, type OfficeApi } from "./runtime/bridge";

const GAME_HOST = "phaser-root";

function Root({ office }: { office: OfficeApi }) {
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const setSnapshot = useOfficeStore((s) => s.setSnapshot);
  const setStream = useOfficeStore((s) => s.setStream);
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

    void office.getSnapshot().then((snap) => {
      setSnapshot(snap);
      setTimeout(() => created.scene.applySnapshot(snap), 100);
    });

    return () => {
      offSnap();
      offStream();
      created.game.destroy(true);
      gameRef.current = null;
    };
  }, [addToolNote, appendStreamToken, office, setSnapshot, setStream]);

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
  const [office, setOffice] = useState<OfficeApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createOfficeBridge()
      .then((api) => {
        if (cancelled) return;
        window.office = api;
        setOffice(api);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace" }}>
        Failed to start office: {error}
      </div>
    );
  }

  if (!office) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#8b97ab" }}>
        Booting office…
      </div>
    );
  }

  return <Root office={office} />;
}

createRoot(document.getElementById("root")!).render(<Boot />);
