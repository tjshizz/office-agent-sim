import type { WorldSnapshot } from "@office-sim/shared";

type Props = {
  snapshot: WorldSnapshot;
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

export function Hud({ snapshot, onPauseToggle, onOpenKey, onDismissToast }: Props) {
  const ambientPct = Math.min(
    100,
    Math.round((snapshot.tokens.ambientUsed / snapshot.tokens.ambientCap) * 100),
  );
  const chatPct = Math.min(
    100,
    Math.round((snapshot.tokens.chatUsed / snapshot.tokens.chatCap) * 100),
  );

  return (
    <div className="hud">
      <div className="brand">
        <span className="logo">OFFICE AGENT SIM</span>
        <span className="muted">{formatMs(snapshot.simMs)}</span>
      </div>
      <div className="meters">
        <div className="meter">
          <span>Ambient {ambientPct}%</span>
          <div className="bar">
            <i style={{ width: `${ambientPct}%` }} />
          </div>
        </div>
        <div className="meter">
          <span>Chat {chatPct}%</span>
          <div className="bar chat">
            <i style={{ width: `${chatPct}%` }} />
          </div>
        </div>
        {snapshot.ambientBudgetClosed ? (
          <span className="badge">Bark mode</span>
        ) : (
          <span className="badge ok">Grok ambient</span>
        )}
      </div>
      <div className="hud-actions">
        <button type="button" onClick={onPauseToggle}>
          {snapshot.paused ? "Resume" : "Pause"}
        </button>
        <button type="button" className="ghost" onClick={onOpenKey}>
          {snapshot.hasApiKey ? "API key ✓" : "API key"}
        </button>
      </div>
      {snapshot.toast ? (
        <div className="toast" onClick={onDismissToast} role="status">
          {snapshot.toast}
        </div>
      ) : null}
      <div className="hint">Click an employee whenever you want to talk to them</div>

    </div>
  );
}
