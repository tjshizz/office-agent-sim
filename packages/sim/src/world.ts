import {
  DEFAULT_TOKEN_CAPS,
  MAP_HEIGHT,
  MAP_WIDTH,
  USER_ID,
  createSeedAgents,
  createSeedRelationships,
  type AgentState,
  type Conversation,
  type ConversationLine,
  type Intention,
  type IntentionKind,
  type MemoryFact,
  type Relationship,
  type TokenUsage,
  type WorldSnapshot,
} from "@office-sim/shared";
import { facingFromStep, findPath, isWalkable } from "./pathfinding.js";
import { applyIntention, barkLine, pickNextIntention, pickSocialPair } from "./policy.js";

const TICK_MS = 100;
const TILES_PER_SEC = 3.2;

const LINE_INTERVAL_MS = 2800;
const SOCIAL_BEAT_MS = 20_000;
const MEETING_INTERVAL_MS = 180_000;
const WORK_DURATION_MS = 12_000;
const COFFEE_DURATION_MS = 4_000;
const WANDER_DURATION_MS = 5_000;

export type AmbientRequest = {
  kind: "pair" | "meeting";
  conversationId: string;
  participantIds: string[];
  generation: number;
};

export type WorldEvents = {
  onAmbientNeeded?: (req: AmbientRequest) => void;
  onDirty?: () => void;
};

export class World {
  simMs = 0;
  paused = false;
  agents: AgentState[] = createSeedAgents();
  conversations: Conversation[] = [];
  memories: MemoryFact[] = [];
  relationships: Relationship[] = createSeedRelationships();
  activeConversationId: string | null = null;
  bubble: { agentId: string; text: string } | null = null;
  tokens: TokenUsage = {
    ambientUsed: 0,
    ambientCap: DEFAULT_TOKEN_CAPS.ambientCap,
    chatUsed: 0,
    chatCap: DEFAULT_TOKEN_CAPS.chatCap,
  };
  hasApiKey = false;
  toast: string | null = null;
  meetingDue = false;

  private lastSocialBeat = 0;
  private lastMeeting = 0;
  private lineAccum = 0;
  private meetingKickAt: number | null = null;
  private events: WorldEvents;

  constructor(events: WorldEvents = {}) {
    this.events = events;
  }

  get ambientBudgetClosed(): boolean {
    return !this.hasApiKey || this.tokens.ambientUsed >= this.tokens.ambientCap;
  }

  markDirty(): void {
    this.events.onDirty?.();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.markDirty();
  }

  setHasApiKey(has: boolean): void {
    this.hasApiKey = has;
    this.markDirty();
  }

  addTokens(kind: "ambient" | "chat", n: number): void {
    if (kind === "ambient") this.tokens.ambientUsed += n;
    else this.tokens.chatUsed += n;
    this.markDirty();
  }

  setToast(msg: string | null): void {
    this.toast = msg;
    this.markDirty();
  }

  snapshot(): WorldSnapshot {
    return {
      simMs: this.simMs,
      paused: this.paused,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      agents: this.agents.map((a) => structuredClone(a)),
      conversations: this.conversations.map((c) => structuredClone(c)),
      activeConversationId: this.activeConversationId,
      bubble: this.bubble ? { ...this.bubble } : null,
      tokens: { ...this.tokens },
      hasApiKey: this.hasApiKey,
      ambientBudgetClosed: this.ambientBudgetClosed,
      toast: this.toast,
      meetingDue: this.meetingDue,
    };
  }

  tick(): void {
    if (this.paused) return;
    this.simMs += TICK_MS;
    this.advanceMovement();
    this.advanceTasks();
    this.advanceDialogue();
    this.maybeSocialBeat();
    this.maybeMeeting();
    this.maybeKickMeetingScript();
    this.markDirty();
  }

  private advanceMovement(): void {
    const step = (TILES_PER_SEC * TICK_MS) / 1000;
    for (const agent of this.agents) {
      if (!agent.pos) {
        agent.pos = { x: agent.tile.x, y: agent.tile.y };
      }
      if (!agent.path.length) {
        agent.pos.x = agent.tile.x;
        agent.pos.y = agent.tile.y;
        continue;
      }

      let remaining = step;
      agent.status = "walking";
      while (remaining > 0 && agent.path.length) {
        const next = agent.path[0]!;
        const dx = next.x - agent.pos.x;
        const dy = next.y - agent.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.0001) {
          agent.path.shift();
          agent.tile = { x: next.x, y: next.y };
          agent.pos = { x: next.x, y: next.y };
          continue;
        }
        agent.facing = facingFromStep(
          { x: Math.round(agent.pos.x), y: Math.round(agent.pos.y) },
          next,
        );
        if (dist <= remaining) {
          agent.pos = { x: next.x, y: next.y };
          agent.tile = { x: next.x, y: next.y };
          agent.path.shift();
          remaining -= dist;
        } else {
          agent.pos.x += (dx / dist) * remaining;
          agent.pos.y += (dy / dist) * remaining;
          agent.tile = {
            x: Math.round(agent.pos.x),
            y: Math.round(agent.pos.y),
          };
          remaining = 0;
        }
      }

      if (!agent.path.length) {
        agent.pos = { x: agent.tile.x, y: agent.tile.y };
        this.onArrived(agent);
      }
    }
  }

  private onArrived(agent: AgentState): void {
    switch (agent.intention.kind) {
      case "go_work":
        agent.status = "working";
        agent.intention.untilSimMs = this.simMs + WORK_DURATION_MS;
        break;
      case "get_coffee":
        agent.status = "idle";
        agent.intention.untilSimMs = this.simMs + COFFEE_DURATION_MS;
        agent.socialNeed = Math.min(1, agent.socialNeed + 0.08);
        break;
      case "wander":
        if (agent.intention.targetAgentId) {
          const other = this.agents.find((a) => a.soul.id === agent.intention.targetAgentId);
          if (other && other.status !== "talking") {
            const d =
              Math.abs(agent.tile.x - other.tile.x) + Math.abs(agent.tile.y - other.tile.y);
            if (d <= 2) {
              const conv = this.startPairConversation(agent, other);
              if (this.ambientBudgetClosed) this.playBarkExchange(conv, agent, other);
              else {
                this.events.onAmbientNeeded?.({
                  kind: "pair",
                  conversationId: conv.id,
                  participantIds: [agent.soul.id, other.soul.id],
                  generation: conv.generation,
                });
              }
              return;
            }
          }
        }
        agent.status = "idle";
        agent.intention.untilSimMs = this.simMs + WANDER_DURATION_MS;
        break;
      case "attend_meeting":
        agent.status = "idle";
        break;
      case "talk":
        agent.status = "talking";
        break;
      case "wait":
        agent.status = "idle";
        break;
      default: {
        const _exhaustive: never = agent.intention.kind;
        void _exhaustive;
        agent.status = "idle";
      }
    }
  }

  private advanceTasks(): void {
    for (const agent of this.agents) {
      if (agent.status === "talking") continue;
      if (agent.path.length) continue;

      if (agent.status === "working") {
        agent.taskProgress = Math.min(1, agent.taskProgress + TICK_MS / WORK_DURATION_MS);
        agent.socialNeed = Math.min(1, agent.socialNeed + 0.0008);
      } else {
        agent.socialNeed = Math.min(1, agent.socialNeed + 0.0003);
      }

      const until = agent.intention.untilSimMs;
      if (until !== undefined && this.simMs >= until) {
        const next = pickNextIntention(agent, this.agents, this.meetingDue);
        if (next.kind === "talk" && next.targetAgentId) {
          const other = this.agents.find((a) => a.soul.id === next.targetAgentId);
          if (other && other.status !== "talking") {
            const conv = this.startPairConversation(agent, other);
            if (this.ambientBudgetClosed) this.playBarkExchange(conv, agent, other);
            else {
              this.events.onAmbientNeeded?.({
                kind: "pair",
                conversationId: conv.id,
                participantIds: [agent.soul.id, other.soul.id],
                generation: conv.generation,
              });
            }
          } else {
            applyIntention(agent, pickNextIntention(agent, this.agents, false), this.agents);
          }
        } else {
          applyIntention(agent, next, this.agents);
        }
      } else if (
        !agent.path.length &&
        agent.status !== "working" &&
        agent.intention.kind !== "attend_meeting" &&
        until === undefined &&
        agent.intention.kind !== "wait"
      ) {
        // arrived without timer — set one
        agent.intention.untilSimMs = this.simMs + WANDER_DURATION_MS;
      }
    }
  }

  private advanceDialogue(): void {
    const liveOrScripted = this.conversations.find(
      (c) =>
        c.mode === "scripted" &&
        c.cursor < c.lines.length &&
        (!this.activeConversationId || this.activeConversationId !== c.id),
    );
    if (!liveOrScripted) {
      // keep bubble briefly then clear if no scripted playback
      return;
    }

    this.lineAccum += TICK_MS;
    if (this.lineAccum < LINE_INTERVAL_MS) return;
    this.lineAccum = 0;

    const line = liveOrScripted.lines[liveOrScripted.cursor]!;
    liveOrScripted.cursor += 1;
    this.bubble = { agentId: line.speakerId, text: line.text };

    if (liveOrScripted.cursor >= liveOrScripted.lines.length) {
      this.finishConversation(liveOrScripted.id);
    }
  }

  private maybeSocialBeat(): void {
    if (this.simMs - this.lastSocialBeat < SOCIAL_BEAT_MS) return;
    if (this.conversations.some((c) => c.mode === "scripted" && c.cursor < c.lines.length)) return;
    if (this.activeConversationId) return;

    this.lastSocialBeat = this.simMs;
    const pair = pickSocialPair(this.agents, this.relationships);
    if (!pair) return;

    const [a, b] = pair;
    const conv = this.startPairConversation(a, b);

    if (this.ambientBudgetClosed) {
      this.playBarkExchange(conv, a, b);
      return;
    }

    this.events.onAmbientNeeded?.({
      kind: "pair",
      conversationId: conv.id,
      participantIds: [a.soul.id, b.soul.id],
      generation: conv.generation,
    });
  }

  private maybeMeeting(): void {
    if (this.simMs - this.lastMeeting < MEETING_INTERVAL_MS) return;
    if (this.simMs < MEETING_INTERVAL_MS) return;
    this.lastMeeting = this.simMs;
    this.meetingDue = true;

    for (const agent of this.agents) {
      if (this.activeConversationId) break;
      applyIntention(agent, { kind: "attend_meeting", locationId: "meeting_table" }, this.agents);
    }
    this.meetingKickAt = this.simMs + 4_000;
  }

  private maybeKickMeetingScript(): void {
    if (this.meetingKickAt === null || this.simMs < this.meetingKickAt) return;
    this.meetingKickAt = null;
    this.meetingDue = false;
    if (this.activeConversationId) return;

    const ids = this.agents.map((a) => a.soul.id);
    const conv: Conversation = {
      id: `meeting-${this.simMs}`,
      participantIds: ids,
      mode: "scripted",
      generation: 1,
      lines: [],
      cursor: 0,
      locationId: "meeting_table",
    };
    this.conversations.push(conv);
    for (const agent of this.agents) {
      agent.status = "talking";
      agent.intention = { kind: "talk" };
      agent.path = [];
    }

    if (this.ambientBudgetClosed) {
      conv.lines = ids.slice(0, 4).map((id, i) => ({
        speakerId: id,
        text:
          i === 0
            ? "Standup: blockers?"
            : i === 1
              ? "None on my side."
              : i === 2
                ? "Need coffee, then designs."
                : "I'll close the open loops.",
      }));
      this.lineAccum = LINE_INTERVAL_MS;
      return;
    }

    this.events.onAmbientNeeded?.({
      kind: "meeting",
      conversationId: conv.id,
      participantIds: ids,
      generation: conv.generation,
    });
  }

  startPairConversation(a: AgentState, b: AgentState): Conversation {
    applyIntention(a, { kind: "talk", targetAgentId: b.soul.id }, this.agents);
    applyIntention(b, { kind: "talk", targetAgentId: a.soul.id }, this.agents);
    // face each other / stand still
    a.path = [];
    b.path = [];
    a.status = "talking";
    b.status = "talking";

    const conv: Conversation = {
      id: `conv-${a.soul.id}-${b.soul.id}-${this.simMs}`,
      participantIds: [a.soul.id, b.soul.id],
      mode: "scripted",
      generation: 1,
      lines: [],
      cursor: 0,
    };
    this.conversations.push(conv);
    this.markDirty();
    return conv;
  }

  playBarkExchange(conv: Conversation, a: AgentState, b: AgentState): void {
    conv.lines = [
      { speakerId: a.soul.id, text: barkLine(a) },
      { speakerId: b.soul.id, text: barkLine(b) },
      { speakerId: a.soul.id, text: barkLine(a) },
    ];
    conv.cursor = 0;
    this.lineAccum = LINE_INTERVAL_MS;
    this.markDirty();
  }

  applyAmbientScript(
    conversationId: string,
    generation: number,
    lines: ConversationLine[],
    intentions: { agentId: string; kind: IntentionKind; locationId?: string; targetAgentId?: string }[],
  ): void {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv || conv.generation !== generation || conv.mode !== "scripted") return;
    conv.lines = lines.map((l) => ({ speakerId: l.speakerId, text: l.text }));
    conv.cursor = 0;
    this.lineAccum = LINE_INTERVAL_MS;
    // stash post-conversation intentions on conversation via a side map — applied on finish
    (conv as Conversation & { pendingIntentions?: typeof intentions }).pendingIntentions = intentions;
    this.markDirty();
  }

  finishConversation(conversationId: string): void {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const pending = (conv as Conversation & { pendingIntentions?: { agentId: string; kind: IntentionKind; locationId?: string; targetAgentId?: string }[] }).pendingIntentions;

    for (const id of conv.participantIds) {
      if (id === USER_ID) continue;
      const agent = this.agents.find((a) => a.soul.id === id);
      if (!agent) continue;
      const planned = pending?.find((p) => p.agentId === id);
      if (planned) {
        applyIntention(
          agent,
          {
            kind: planned.kind,
            locationId: planned.locationId,
            targetAgentId: planned.targetAgentId,
          },
          this.agents,
        );
      } else {
        applyIntention(agent, pickNextIntention(agent, this.agents, false), this.agents);
      }

    }

    this.bumpWarmth(conv.participantIds.filter((id) => id !== USER_ID));
    this.bubble = null;
    if (this.activeConversationId === conversationId) {
      this.activeConversationId = null;
    }
    this.conversations = this.conversations.filter((c) => c.id !== conversationId);
    this.markDirty();
  }

  bumpWarmth(participantIds: string[]): void {
    for (let i = 0; i < participantIds.length; i++) {
      for (let j = i + 1; j < participantIds.length; j++) {
        const a = participantIds[i]!;
        const b = participantIds[j]!;
        let rel = this.relationships.find(
          (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
        );
        if (!rel) {
          rel = { a, b, warmth: 0 };
          this.relationships.push(rel);
        }
        rel.warmth = Math.min(1, rel.warmth + 0.05);
      }
    }
  }

  join(opts: { conversationId?: string; agentId?: string }): Conversation | null {
    let conv: Conversation | undefined;

    if (opts.conversationId) {
      conv = this.conversations.find((c) => c.id === opts.conversationId);
    } else if (opts.agentId) {
      conv = this.conversations.find(
        (c) => c.participantIds.includes(opts.agentId!) && c.cursor < c.lines.length + 1,
      );
      if (!conv) {
        const agent = this.agents.find((a) => a.soul.id === opts.agentId);
        if (!agent) return null;
        // start 1:1 live chat
        agent.path = [];
        agent.status = "talking";
        agent.intention = { kind: "talk", targetAgentId: USER_ID };
        conv = {
          id: `live-${agent.soul.id}-${this.simMs}`,
          participantIds: [agent.soul.id, USER_ID],
          mode: "live",
          generation: 1,
          lines: [],
          cursor: 0,
        };
        this.conversations.push(conv);
        this.activeConversationId = conv.id;
        this.bubble = null;
        this.markDirty();
        return conv;
      }
    }

    if (!conv) return null;

    // freeze script, go live
    conv.mode = "live";
    conv.generation += 1;
    conv.lines = conv.lines.slice(0, conv.cursor);
    if (!conv.participantIds.includes(USER_ID)) {
      conv.participantIds.push(USER_ID);
    }
    this.activeConversationId = conv.id;
    this.bubble = null;
    this.lineAccum = 0;

    for (const id of conv.participantIds) {
      if (id === USER_ID) continue;
      const agent = this.agents.find((a) => a.soul.id === id);
      if (agent) {
        agent.path = [];
        agent.status = "talking";
        agent.intention = { kind: "talk" };
      }
    }

    this.markDirty();
    return conv;
  }

  closeChat(): void {
    if (!this.activeConversationId) return;
    const id = this.activeConversationId;
    this.activeConversationId = null;
    this.finishConversation(id);
  }

  appendUserLine(text: string): Conversation | null {
    if (!this.activeConversationId) return null;
    const conv = this.conversations.find((c) => c.id === this.activeConversationId);
    if (!conv || conv.mode !== "live") return null;
    conv.lines.push({ speakerId: USER_ID, text, at: this.simMs });
    this.markDirty();
    return conv;
  }

  appendAgentLine(conversationId: string, generation: number, speakerId: string, text: string): void {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (!conv || conv.generation !== generation) return;
    conv.lines.push({ speakerId, text, at: this.simMs });
    this.bubble = { agentId: speakerId, text };
    this.markDirty();
  }

  rememberFact(agentId: string, about: string, text: string): void {
    this.memories.push({
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      about,
      text,
      at: this.simMs,
    });
    const mine = this.memories.filter((m) => m.agentId === agentId);
    if (mine.length > 30) {
      const drop = mine.length - 30;
      const oldest = mine.sort((a, b) => a.at - b.at).slice(0, drop).map((m) => m.id);
      this.memories = this.memories.filter((m) => !oldest.includes(m.id));
    }
    this.markDirty();
  }

  assignTask(agentId: string, kind: IntentionKind, locationId?: string): void {
    const agent = this.agents.find((a) => a.soul.id === agentId);
    if (!agent) return;
    applyIntention(agent, { kind, locationId }, this.agents);
    this.markDirty();
  }

  endLiveConversation(): void {
    this.closeChat();
  }

  pathAgentToTile(agentId: string, tile: { x: number; y: number }): void {
    if (!isWalkable(tile.x, tile.y)) return;
    const agent = this.agents.find((a) => a.soul.id === agentId);
    if (!agent) return;
    const from = {
      x: Math.round(agent.pos?.x ?? agent.tile.x),
      y: Math.round(agent.pos?.y ?? agent.tile.y),
    };
    agent.path = findPath(from, tile);
    agent.status = agent.path.length ? "walking" : agent.status;
    agent.intention = { kind: "wander" };
    this.markDirty();
  }

  /** Kept for command compatibility; floor clicks no longer steer agents. */
  clickTile(_x: number, _y: number): void {
    // no-op: talk by clicking an employee only
  }


  loadState(data: {
    simMs: number;
    agents: AgentState[];
    conversations: Conversation[];
    memories: MemoryFact[];
    relationships: Relationship[];
    tokens: TokenUsage;
  }): void {
    this.simMs = data.simMs;
    this.agents = data.agents.map((a) => ({
      ...a,
      pos: a.pos ?? { x: a.tile.x, y: a.tile.y },
    }));
    this.conversations = data.conversations;
    this.memories = data.memories;
    this.relationships = data.relationships;
    this.tokens = data.tokens;
    this.activeConversationId = null;
    this.bubble = null;
    this.markDirty();
  }

  applyIntentionTo(agentId: string, intention: Intention): void {
    const agent = this.agents.find((a) => a.soul.id === agentId);
    if (!agent) return;
    applyIntention(agent, intention, this.agents);
    this.markDirty();
  }
}
