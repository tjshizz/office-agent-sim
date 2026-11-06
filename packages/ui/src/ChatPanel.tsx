import { useEffect, useRef, useState } from "react";
import { USER_ID, type WorldSnapshot } from "@office-sim/shared";
import type { StreamState } from "./store.js";

type Props = {
  snapshot: WorldSnapshot;
  stream: StreamState | null;
  onSend: (text: string) => void;
  onClose: () => void;
};

export function ChatPanel({ snapshot, stream, onSend, onClose }: Props) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const conv = snapshot.conversations.find((c) => c.id === snapshot.activeConversationId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.lines.length, stream?.text]);

  if (!conv) return null;

  const names = new Map(snapshot.agents.map((a) => [a.soul.id, a.soul.name]));
  names.set(USER_ID, "You");

  return (
    <aside className="chat-panel">
      <header>
        <div>
          <strong>Joined conversation</strong>
          <div className="muted">
            {conv.participantIds.map((id) => names.get(id) ?? id).join(" · ")}
          </div>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Leave
        </button>
      </header>
      <div className="chat-log">
        {conv.lines.map((line, i) => (
          <div key={`${i}-${line.speakerId}`} className={line.speakerId === USER_ID ? "me" : "them"}>
            <span className="who">{names.get(line.speakerId) ?? line.speakerId}</span>
            <p>{line.text}</p>
          </div>
        ))}
        {stream && stream.conversationId === conv.id && stream.text ? (
          <div className="them streaming">
            <span className="who">
              {names.get(stream.speakerId ?? "") ?? stream.speakerId ?? "…"}
            </span>
            <p>{stream.text}</p>
          </div>
        ) : null}
        {stream?.toolNotes.map((n, i) => (
          <div key={`tool-${i}`} className="tool-note">
            {n}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          onSend(t);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Talk to them like Grok Bot…"
          maxLength={2000}
        />
        <button type="submit">Send</button>
      </form>
    </aside>
  );
}
