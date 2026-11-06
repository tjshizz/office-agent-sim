import { useState } from "react";

type Props = {
  open: boolean;
  hasKey: boolean;
  onSave: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export function ApiKeyModal({ open, hasKey, onSave, onClear, onClose }: Props) {
  const [key, setKey] = useState("");
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>xAI API key</h2>
        <p>
          Ambient chatter and live join use Grok via api.x.ai. Without a key the office still runs
          on bark lines.
        </p>
        <input
          type="password"
          placeholder={hasKey ? "•••••••• (saved)" : "xai-..."}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <button
            type="button"
            onClick={() => {
              if (key.trim()) {
                onSave(key.trim());
                setKey("");
                onClose();
              }
            }}
          >
            Save
          </button>
          {hasKey ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onClear();
                setKey("");
              }}
            >
              Clear key
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
