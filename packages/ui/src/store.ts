import { create } from "zustand";
import { overlayCanonicalSouls, type ServerMeta, type WorldSnapshot } from "@office-sim/shared";

export type StreamState = {
  conversationId: string;
  generation: number;
  text: string;
  speakerId?: string;
  toolNotes: string[];
};

type OfficeUiState = {
  snapshot: WorldSnapshot | null;
  stream: StreamState | null;
  serverMeta: ServerMeta | null;
  showKeyModal: boolean;
  setSnapshot: (s: WorldSnapshot) => void;
  setStream: (s: StreamState | null) => void;
  setServerMeta: (m: ServerMeta | null) => void;
  appendStreamToken: (token: string) => void;
  addToolNote: (note: string) => void;
  setShowKeyModal: (v: boolean) => void;
};

export const useOfficeStore = create<OfficeUiState>((set) => ({
  snapshot: null,
  stream: null,
  serverMeta: null,
  showKeyModal: false,
  setSnapshot: (snapshot) => set({ snapshot: overlayCanonicalSouls(snapshot) }),
  setStream: (stream) => set({ stream }),
  setServerMeta: (serverMeta) => set({ serverMeta }),
  appendStreamToken: (token) =>
    set((s) =>
      s.stream ? { stream: { ...s.stream, text: s.stream.text + token } } : {},
    ),
  addToolNote: (note) =>
    set((s) =>
      s.stream
        ? { stream: { ...s.stream, toolNotes: [...s.stream.toolNotes, note] } }
        : {},
    ),
  setShowKeyModal: (showKeyModal) => set({ showKeyModal }),
}));

