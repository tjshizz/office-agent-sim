import { ApiKeyModal } from "./ApiKeyModal.js";
import { ChatPanel } from "./ChatPanel.js";
import { Hud } from "./Hud.js";
import { useOfficeStore } from "./store.js";

export type OfficeBridge = {
  sendCommand: (cmd: unknown) => void;
};

type Props = {
  bridge: OfficeBridge;
  gameHostId: string;
};

export function AppShell({ bridge, gameHostId }: Props) {
  const snapshot = useOfficeStore((s) => s.snapshot);
  const stream = useOfficeStore((s) => s.stream);
  const serverMeta = useOfficeStore((s) => s.serverMeta);
  const showKeyModal = useOfficeStore((s) => s.showKeyModal);
  const setShowKeyModal = useOfficeStore((s) => s.setShowKeyModal);

  return (
    <div className="app-shell">
      <div className="stage">
        <div id={gameHostId} className="game-host" />
        {snapshot ? (
          <Hud
            snapshot={snapshot}
            serverMeta={serverMeta}
            onPauseToggle={() =>
              bridge.sendCommand({ type: snapshot.paused ? "resume" : "pause" })
            }
            onOpenKey={() => setShowKeyModal(true)}
            onDismissToast={() => bridge.sendCommand({ type: "dismissToast" })}
          />
        ) : null}
        {snapshot?.activeConversationId ? (
          <ChatPanel
            snapshot={snapshot}
            stream={stream}
            onSend={(text) => bridge.sendCommand({ type: "send", text })}
            onClose={() => bridge.sendCommand({ type: "closeChat" })}
          />
        ) : null}
        <ApiKeyModal
          open={showKeyModal}
          hasKey={snapshot?.hasApiKey ?? false}
          onSave={(key) => bridge.sendCommand({ type: "setApiKey", key })}
          onClear={() => bridge.sendCommand({ type: "clearApiKey" })}
          onClose={() => setShowKeyModal(false)}
        />
      </div>
      <p className="rotate-hint">Turn your phone sideways for the full office view.</p>
    </div>
  );
}
