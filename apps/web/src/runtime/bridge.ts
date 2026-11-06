import { MindQueue } from "@office-sim/agents";
import { OfficeCommandSchema, type WorldSnapshot } from "@office-sim/shared";
import { World } from "@office-sim/sim";
import { WebOfficeDb } from "./db";
import { WebKeyStore } from "./keystore";

export type OfficeApi = {
  getSnapshot: () => Promise<WorldSnapshot>;
  sendCommand: (cmd: unknown) => void;
  onSnapshot: (cb: (snap: WorldSnapshot) => void) => () => void;
  onStream: (cb: (payload: unknown) => void) => () => void;
};

const GROK_BASE = "/xai/v1";

export async function createOfficeBridge(): Promise<OfficeApi> {
  const keys = new WebKeyStore();
  const db = new WebOfficeDb();
  await db.ensureReady();

  const snapshotListeners = new Set<(snap: WorldSnapshot) => void>();
  const streamListeners = new Set<(payload: unknown) => void>();

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const emitSnapshot = (): void => {
    const snapshot = world.snapshot();
    for (const cb of snapshotListeners) cb(snapshot);
  };

  const emitStream = (payload: unknown): void => {
    for (const cb of streamListeners) cb(payload);
  };

  const scheduleSave = (): void => {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (!dirty) return;
      dirty = false;
      void db.saveWorld({
        simMs: world.simMs,
        agents: world.agents,
        conversations: world.conversations,
        memories: world.memories,
        relationships: world.relationships,
        tokens: world.tokens,
      });
    }, 2000);
  };

  const world = new World({
    onDirty: () => {
      emitSnapshot();
      scheduleSave();
    },
    onAmbientNeeded: (req) => {
      mind.enqueueAmbient(req);
    },
  });

  const mind = new MindQueue(
    world,
    () => keys.load(),
    (payload) => {
      if (payload.token) {
        emitStream({
          type: "token",
          conversationId: payload.conversationId,
          generation: payload.generation,
          token: payload.token,
          speakerId: payload.speakerId,
        });
      }
      if (payload.toolNote) {
        emitStream({
          type: "tool",
          note: payload.toolNote,
        });
      }
      if (payload.done) {
        emitStream({
          type: "done",
          conversationId: payload.conversationId,
          generation: payload.generation,
        });
        emitSnapshot();
      }
    },
    GROK_BASE,
  );

  const saved = await db.loadWorld();
  if (saved) {
    world.loadState(saved);
  }
  world.setHasApiKey(Boolean(keys.load()));

  const tickTimer = setInterval(() => {
    world.tick();
  }, 100);

  const flushAndStop = (): void => {
    clearInterval(tickTimer);
    if (saveTimer) clearTimeout(saveTimer);
    if (dirty) {
      void db.saveWorld({
        simMs: world.simMs,
        agents: world.agents,
        conversations: world.conversations,
        memories: world.memories,
        relationships: world.relationships,
        tokens: world.tokens,
      });
    }
    db.close();
  };

  window.addEventListener("beforeunload", flushAndStop);

  const handleCommand = (raw: unknown): void => {
    const parsed = OfficeCommandSchema.safeParse(raw);
    if (!parsed.success) {
      world.setToast("Invalid command");
      return;
    }
    const cmd = parsed.data;
    switch (cmd.type) {
      case "pause":
        world.setPaused(true);
        break;
      case "resume":
        world.setPaused(false);
        break;
      case "join": {
        const conv = world.join({ conversationId: cmd.conversationId, agentId: cmd.agentId });
        if (!conv) world.setToast("Could not join");
        break;
      }
      case "closeChat":
        world.closeChat();
        break;
      case "send": {
        const conv = world.appendUserLine(cmd.text);
        if (!conv) {
          world.setToast("No active chat");
          break;
        }
        mind.enqueueLive(conv.id, conv.generation, cmd.text);
        emitStream({
          type: "start",
          conversationId: conv.id,
          generation: conv.generation,
        });
        break;
      }
      case "setApiKey":
        keys.save(cmd.key);
        mind.refreshClient();
        world.setHasApiKey(true);
        world.setToast("API key saved");
        break;
      case "clearApiKey":
        keys.clear();
        mind.refreshClient();
        world.setHasApiKey(false);
        world.setToast("API key cleared");
        break;
      case "clickTile":
        world.clickTile(cmd.x, cmd.y);
        break;
      case "dismissToast":
        world.setToast(null);
        break;
      default: {
        const _exhaustive: never = cmd;
        void _exhaustive;
      }
    }
  };

  emitSnapshot();

  return {
    getSnapshot: async () => world.snapshot(),
    sendCommand: (cmd) => handleCommand(cmd),
    onSnapshot: (cb) => {
      snapshotListeners.add(cb);
      return () => {
        snapshotListeners.delete(cb);
      };
    },
    onStream: (cb) => {
      streamListeners.add(cb);
      return () => {
        streamListeners.delete(cb);
      };
    },
  };
}
