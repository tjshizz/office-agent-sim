import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createGame } from "@office-sim/game";
import { AppShell, useOfficeStore } from "@office-sim/ui";
import "../../../../packages/ui/src/styles.css";



const GAME_HOST = "phaser-root";

function Root() {
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
        window.office.sendCommand({ type: "join", agentId });
      },
    });

    gameRef.current = created;

    const offSnap = window.office.onSnapshot((snap) => {
      setSnapshot(snap);
      created.scene.applySnapshot(snap);
    });

    const offStream = window.office.onStream((payload) => {
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

    void window.office.getSnapshot().then((snap) => {
      setSnapshot(snap);
      // scene may not be ready on first tick
      setTimeout(() => created.scene.applySnapshot(snap), 100);
    });

    return () => {
      offSnap();
      offStream();
      created.game.destroy(true);
      gameRef.current = null;
    };
  }, [addToolNote, appendStreamToken, setSnapshot, setStream]);

  return (
    <AppShell
      gameHostId={GAME_HOST}
      bridge={{
        sendCommand: (cmd) => window.office.sendCommand(cmd),
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Root />);

