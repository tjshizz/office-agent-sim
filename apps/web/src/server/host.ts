import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { MindQueue } from "@office-sim/agents";
import {
  OfficeCommandSchema,
  migrateAgentId,
  type AwayEvent,
  type HostPayload,
  type ServerMeta,
} from "@office-sim/shared";
import { World } from "@office-sim/sim";

export type { AwayEvent, HostPayload, ServerMeta };

type Listener = (payload: HostPayload) => void;
type StreamListener = (payload: unknown) => void;

const AWAY_INTERVAL_MS = 90_000;
const SAVE_INTERVAL_MS = 5_000;

const AWAY_SCRIPTS: Record<string, string[]> = {
  maya: [
    "Reviewed the open PR queue and left comments.",
    "Triaged a flaky test in CI.",
    "Updated the release checklist.",
    "Closed a stale bug as duplicate.",
  ],
  tobias: [
    "Drafted tomorrow's standup agenda.",
    "Synced the roadmap board with engineering.",
    "Wrote acceptance criteria for the next story.",
    "Parked a low-priority request for Friday.",
  ],
  lynn: [
    "Tightened spacing on the settings screen.",
    "Exported icon variants for dark mode.",
    "Left design notes on the splash screen.",
    "Organized the Figma handoff folder.",
  ],

  riley: [
    "Filed vendor invoices for the week.",
    "Renewed the staging domain certificate.",
    "Updated the on-call rotation sheet.",
    "Closed three open ops loops.",
  ],
};

export class OfficeHost {
  readonly world: World;
  private mind: MindQueue;
  private apiKey: string | null;
  private startedAt = Date.now();
  private clients = 0;
  private awayLog: AwayEvent[] = [];
  private listeners = new Set<Listener>();
  private streamListeners = new Set<StreamListener>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private awayTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private dataPath: string;
  private dirty = false;

  constructor(opts: { dataDir: string; apiKey?: string | null }) {
    this.dataPath = join(opts.dataDir, "office-world.json");
    this.apiKey = opts.apiKey?.trim() || process.env.XAI_API_KEY?.trim() || null;

    mkdirSync(dirname(this.dataPath), { recursive: true });

    this.world = new World({
      onDirty: () => {
        this.dirty = true;
        this.publish();
      },
    });

    this.mind = new MindQueue(
      this.world,
      () => this.apiKey,
      (payload) => {
        if (payload.token) {
          this.emitStream({
            type: "token",
            conversationId: payload.conversationId,
            generation: payload.generation,
            token: payload.token,
            speakerId: payload.speakerId,
          });
        }
        if (payload.toolNote) {
          this.emitStream({ type: "tool", note: payload.toolNote });
        }
        if (payload.done) {
          this.emitStream({
            type: "done",
            conversationId: payload.conversationId,
            generation: payload.generation,
          });
          this.publish();
        }
      },
    );

    this.load();
    this.world.setHasApiKey(Boolean(this.apiKey));
  }

  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.world.tick(), 100);
    this.awayTimer = setInterval(() => this.runAwayShift(), AWAY_INTERVAL_MS);
    this.saveTimer = setInterval(() => this.saveIfDirty(), SAVE_INTERVAL_MS);
    // first away beat after a short delay so empty servers still show activity
    setTimeout(() => this.runAwayShift(), 8_000);
    this.publish();
    console.log(
      `[office-host] running · key=${this.apiKey ? "yes" : "no"} · data=${this.dataPath}`,
    );
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.awayTimer) clearInterval(this.awayTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.saveIfDirty(true);
  }

  addClient(): () => void {
    this.clients += 1;
    this.publish();
    return () => {
      this.clients = Math.max(0, this.clients - 1);
      this.publish();
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.payload());
    return () => this.listeners.delete(listener);
  }

  onStream(listener: StreamListener): () => void {
    this.streamListeners.add(listener);
    return () => this.streamListeners.delete(listener);
  }

  payload(): HostPayload {
    return {
      snapshot: this.world.snapshot(),
      server: {
        uptimeMs: Date.now() - this.startedAt,
        clients: this.clients,
        startedAt: this.startedAt,
        awayLog: this.awayLog.slice(-40),
        hasServerKey: Boolean(this.apiKey),
      },
    };
  }

  handleCommand(raw: unknown): { ok: boolean; error?: string } {
    const parsed = OfficeCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Invalid command" };
    const cmd = parsed.data;

    switch (cmd.type) {
      case "pause":
        this.world.setPaused(true);
        break;
      case "resume":
        this.world.setPaused(false);
        break;
      case "join": {
        const conv = this.world.join({
          conversationId: cmd.conversationId,
          agentId: cmd.agentId,
        });
        if (!conv) return { ok: false, error: "Could not join" };
        break;
      }
      case "closeChat":
        this.world.closeChat();
        break;
      case "send": {
        const conv = this.world.appendUserLine(cmd.text);
        if (!conv) return { ok: false, error: "No active chat" };
        if (!this.apiKey) {
          this.world.setToast("Server has no XAI_API_KEY — set it on Render");
          return { ok: false, error: "No server API key" };
        }
        this.mind.enqueueLive(conv.id, conv.generation, cmd.text);
        this.emitStream({
          type: "start",
          conversationId: conv.id,
          generation: conv.generation,
        });
        break;
      }
      case "setApiKey":
        this.apiKey = cmd.key.trim();
        this.mind.refreshClient();
        this.world.setHasApiKey(true);
        this.world.setToast("Server API key updated for this session");
        this.dirty = true;
        break;
      case "clearApiKey":
        this.apiKey = null;
        this.mind.refreshClient();
        this.world.setHasApiKey(false);
        this.world.setToast("Server API key cleared");
        this.dirty = true;
        break;
      case "clickTile":
        break;
      case "dismissToast":
        this.world.setToast(null);
        break;
      default: {
        const _exhaustive: never = cmd;
        void _exhaustive;
      }
    }
    return { ok: true };
  }

  private runAwayShift(): void {
    if (this.world.paused) return;
    const agents = this.world.agents;
    if (!agents.length) return;
    const agent = agents[Math.floor(Math.random() * agents.length)]!;
    const scripts = AWAY_SCRIPTS[agent.soul.id] ?? [
      "Kept the office humming.",
      "Checked their task queue.",
    ];
    const text = scripts[Math.floor(Math.random() * scripts.length)]!;
    const event: AwayEvent = {
      id: `away-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      agentId: agent.soul.id,
      agentName: agent.soul.name,
      text,
    };
    this.awayLog.push(event);
    if (this.awayLog.length > 100) this.awayLog = this.awayLog.slice(-100);

    // light visual cue in the sim when nobody is watching
    this.world.bubble = { agentId: agent.soul.id, text: `✓ ${text}` };
    agent.taskProgress = Math.min(1, agent.taskProgress + 0.25);
    agent.socialNeed = Math.min(1, agent.socialNeed + 0.05);
    this.dirty = true;
    this.publish();
  }

  private publish(): void {
    const payload = this.payload();
    for (const listener of this.listeners) listener(payload);
  }

  private emitStream(payload: unknown): void {
    for (const listener of this.streamListeners) listener(payload);
  }

  private load(): void {
    if (!existsSync(this.dataPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.dataPath, "utf8")) as {
        world?: Parameters<World["loadState"]>[0];
        awayLog?: AwayEvent[];
      };
      if (raw.world) {
        this.world.loadState(raw.world);
        // Persist Leo/Sam → Tobias/Lynn rewrite so old ids never come back.
        this.dirty = true;
      }
      if (raw.awayLog) {
        this.awayLog = raw.awayLog.map((e) => {
          const agentId = migrateAgentId(e.agentId);
          const agent = this.world.agents.find((a) => a.soul.id === agentId);
          return {
            ...e,
            agentId,
            agentName: agent?.soul.name ?? e.agentName,
          };
        });
      }
    } catch (err) {
      console.warn("[office-host] failed to load save", err);
    }
  }

  private saveIfDirty(force = false): void {
    if (!this.dirty && !force) return;
    this.dirty = false;
    const body = {
      world: {
        simMs: this.world.simMs,
        agents: this.world.agents,
        conversations: this.world.conversations,
        memories: this.world.memories,
        relationships: this.world.relationships,
        tokens: this.world.tokens,
      },
      awayLog: this.awayLog,
      savedAt: Date.now(),
    };
    writeFileSync(this.dataPath, JSON.stringify(body));
  }
}
