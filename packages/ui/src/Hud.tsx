import type { ServerMeta, WorldSnapshot } from "@office-sim/shared";

type Props = {
  snapshot: WorldSnapshot;
  serverMeta?: ServerMeta | null;
  onPauseToggle: () => void;
  onOpenKey: () => void;
  onDismissToast: () => void;
};

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function Hud({
  snapshot,
  serverMeta,
  onPauseToggle,
  onOpenKey,
  onDismissToast,
}: Props) {
  const chatPct = Math.min(
    100,
    Math.round((snapshot.tokens.chatUsed / snapshot.tokens.chatCap) * 100),
  );
  const latestAway = serverMeta?.awayLog?.at(-1);

  return (
    <div className="hud">
      <div className="brand">
        <span className="logo">OFFICE AGENT SIM</span>
        <span className="muted">{formatMs(snapshot.simMs)}</span>
      </div>
      <div className="meters">
        <span className="badge ok">Ambient free</span>
        {serverMeta ? (
          <span className="badge ok">
            Server · {Math.floor(serverMeta.uptimeMs / 60000)}m · {serverMeta.clients} viewing
          </span>
        ) : (
          <span className="badge">Local only</span>
        )}
        <div className="meter">
          <span>Chat {chatPct}%</span>
          <div className="bar chat">
            <i style={{ width: `${chatPct}%` }} />
          </div>
        </div>
      </div>
      <div className="hud-actions">
        <button type="button" onClick={onPauseToggle}>
          {snapshot.paused ? "Resume" : "Pause"}
        </button>
        <button type="button" className="ghost" onClick={onOpenKey}>
          {snapshot.hasApiKey || serverMeta?.hasServerKey ? "API key ✓" : "API key"}
        </button>
      </div>
      {snapshot.toast ? (
        <div className="toast" onClick={onDismissToast} role="status">
          {snapshot.toast}
        </div>
      ) : null}
      {latestAway ? (
        <div className="away-note">
          While you were away: <strong>{latestAway.agentName}</strong> — {latestAway.text}
        </div>
      ) : null}
      <div className="hint">Click an employee whenever you want to talk to them</div>
    </div>
  );
}

