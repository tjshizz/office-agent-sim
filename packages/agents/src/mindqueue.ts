import type { IntentionKind } from "@office-sim/shared";
import type { AmbientRequest, World } from "@office-sim/sim";
import { GrokClient, LIVE_TOOLS, type ChatMessage } from "./grok.js";
import { ambientSystemPrompt, ambientUserPrompt, liveSystemPrompt } from "./prompts.js";

type QueueItem =
  | { priority: number; kind: "ambient"; req: AmbientRequest }
  | {
      priority: number;
      kind: "live";
      conversationId: string;
      generation: number;
      userText: string;
    };

const AMBIENT_GAP_MS = 8_000;
const MAX_DEPTH = 8;

export class MindQueue {
  private queue: QueueItem[] = [];
  private busy = false;
  private lastAmbientAt = 0;
  private client: GrokClient | null = null;
  private getApiKey: () => string | null;
  private baseUrl?: string;
  private world: World;
  private onStream?: (payload: {
    conversationId: string;
    generation: number;
    token?: string;
    done?: boolean;
    speakerId?: string;
    toolNote?: string;
  }) => void;

  constructor(
    world: World,
    getApiKey: () => string | null,
    onStream?: MindQueue["onStream"],
    baseUrl?: string,
  ) {
    this.world = world;
    this.getApiKey = getApiKey;
    this.onStream = onStream;
    this.baseUrl = baseUrl;
  }

  enqueueAmbient(req: AmbientRequest): void {
    this.enqueue({
      priority: req.kind === "meeting" ? 2 : 3,
      kind: "ambient",
      req,
    });
  }

  enqueueLive(conversationId: string, generation: number, userText: string): void {
    this.enqueue({
      priority: 1,
      kind: "live",
      conversationId,
      generation,
      userText,
    });
  }

  private enqueue(item: QueueItem): void {
    this.queue.push(item);
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.queue.length > MAX_DEPTH) {
      // drop lowest priority (highest number)
      let worst = 0;
      for (let i = 1; i < this.queue.length; i++) {
        if (this.queue[i]!.priority > this.queue[worst]!.priority) worst = i;
      }
      this.queue.splice(worst, 1);
    }
    void this.pump();
  }

  private ensureClient(): GrokClient | null {
    const key = this.getApiKey();
    if (!key) {
      this.client = null;
      return null;
    }
    if (!this.client) this.client = new GrokClient(key, this.baseUrl);
    return this.client;
  }

  refreshClient(): void {
    this.client = null;
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    try {
      if (next.kind === "ambient") {
        const since = Date.now() - this.lastAmbientAt;
        if (since < AMBIENT_GAP_MS) {
          await sleep(AMBIENT_GAP_MS - since);
        }
        await this.runAmbient(next.req);
        this.lastAmbientAt = Date.now();
      } else {
        await this.runLive(next);
      }
    } finally {
      this.busy = false;
      if (this.queue.length) void this.pump();
    }
  }

  private async runAmbient(req: AmbientRequest): Promise<void> {
    if (this.world.ambientBudgetClosed) {
      this.fallbackAmbient(req);
      return;
    }
    const client = this.ensureClient();
    if (!client) {
      this.fallbackAmbient(req);
      return;
    }
    const agents = this.world.agents.filter((a) => req.participantIds.includes(a.soul.id));
    const result = await client.completeJson(
      ambientSystemPrompt(),
      ambientUserPrompt(req.kind, agents, this.world.simMs),
    );
    this.world.addTokens("ambient", result.usageTokens);
    if (!result.script) {
      this.world.setToast(result.error ?? "Ambient script failed");
      this.fallbackAmbient(req);
      return;
    }
    this.world.applyAmbientScript(
      req.conversationId,
      req.generation,
      result.script.lines,
      result.script.intentions,
    );
  }

  private fallbackAmbient(req: AmbientRequest): void {
    const agents = req.participantIds
      .map((id) => this.world.agents.find((a) => a.soul.id === id))
      .filter(Boolean);
    const conv = this.world.conversations.find((c) => c.id === req.conversationId);
    if (!conv || agents.length < 2) return;
    this.world.playBarkExchange(conv, agents[0]!, agents[1]!);
  }

  private async runLive(item: Extract<QueueItem, { kind: "live" }>): Promise<void> {
    const conv = this.world.conversations.find((c) => c.id === item.conversationId);
    if (!conv || conv.generation !== item.generation || conv.mode !== "live") return;

    const client = this.ensureClient();
    if (!client) {
      this.world.setToast("Add an xAI API key to chat live");
      return;
    }

    const speakers = this.world.agents.filter((a) => conv.participantIds.includes(a.soul.id));
    const primary = speakers[0];
    if (!primary) return;

    const memories = this.world.memories.filter((m) =>
      speakers.some((s) => s.soul.id === m.agentId),
    );
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: liveSystemPrompt(speakers, memories, this.world.relationships),
      },
      ...conv.lines.map((l) => ({
        role: (l.speakerId === "user" ? "user" : "assistant") as "user" | "assistant",
        content: l.speakerId === "user" ? l.text : `${speakers.find((s) => s.soul.id === l.speakerId)?.soul.name ?? l.speakerId}: ${l.text}`,
      })),
    ];

    let assembled = "";
    await client.streamChat(
      messages,
      LIVE_TOOLS,
      {
        onToken: (t) => {
          assembled += t;
          this.onStream?.({
            conversationId: item.conversationId,
            generation: item.generation,
            token: t,
            speakerId: primary.soul.id,
          });
        },
        onToolCall: (name, args) => {
          this.handleTool(primary.soul.id, name, args);
        },
        onDone: (full, usage) => {
          const text = (full || assembled).trim();
          if (text) {
            this.world.appendAgentLine(item.conversationId, item.generation, primary.soul.id, text);
          }
          if (usage?.total_tokens) this.world.addTokens("chat", usage.total_tokens);
          else this.world.addTokens("chat", Math.max(50, Math.ceil(text.length / 3)));
          this.onStream?.({
            conversationId: item.conversationId,
            generation: item.generation,
            done: true,
            speakerId: primary.soul.id,
          });
        },
        onError: (err) => {
          this.world.setToast(err.message);
          this.onStream?.({
            conversationId: item.conversationId,
            generation: item.generation,
            done: true,
          });
        },
      },
      undefined,
      primary.soul.temperature,
    );
  }

  private handleTool(speakerId: string, name: string, args: Record<string, unknown>): void {
    switch (name) {
      case "remember_fact": {
        const about = String(args.about ?? "user");
        const text = String(args.text ?? "");
        if (text) {
          this.world.rememberFact(speakerId, about, text);
          this.onStream?.({
            conversationId: this.world.activeConversationId ?? "",
            generation: 0,
            toolNote: `${speakerId} remembered: ${text}`,
          });
        }
        break;
      }
      case "assign_task": {
        const agentId = String(args.agentId ?? "");
        const kind = String(args.kind ?? "go_work") as IntentionKind;
        const locationId = args.locationId ? String(args.locationId) : undefined;
        this.world.assignTask(agentId, kind, locationId);
        this.onStream?.({
          conversationId: this.world.activeConversationId ?? "",
          generation: 0,
          toolNote: `Assigned ${agentId} → ${kind}`,
        });
        break;
      }
      case "end_conversation": {
        this.world.endLiveConversation();
        this.onStream?.({
          conversationId: "",
          generation: 0,
          toolNote: "Conversation ended",
        });
        break;
      }
      default:
        break;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
