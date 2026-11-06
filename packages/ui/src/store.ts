import { create } from "zustand";
import type { WorldSnapshot } from "@office-sim/shared";

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
  showKeyModal: boolean;
  setSnapshot: (s: WorldSnapshot) => void;
  setStream: (s: StreamState | null) => void;
  appendStreamToken: (token: string) => void;
  addToolNote: (note: string) => void;
  setShowKeyModal: (v: boolean) => void;
};

export const useOfficeStore = create<OfficeUiState>((set) => ({
  snapshot: null,
  stream: null,
  showKeyModal: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setStream: (stream) => set({ stream }),
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
