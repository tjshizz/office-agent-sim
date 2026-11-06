import type {
  AgentState,
  Conversation,
  Intention,
  Location,
  MemoryFact,
  Relationship,
  Soul,
  WorldSnapshot,
} from "./models.js";

export const MAP_WIDTH = 24;
export const MAP_HEIGHT = 16;

/** Retired cast ids → current cast (Leo/Sam renamed). */
export const AGENT_ID_MIGRATIONS: Record<string, string> = {
  leo: "tobias",
  sam: "lynn",
  desk_leo: "desk_tobias",
  desk_sam: "desk_lynn",
};

export function migrateAgentId(id: string): string {
  return AGENT_ID_MIGRATIONS[id] ?? id;
}

/** 0 = walkable, 1 = blocked */
export const OFFICE_COLLISION: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export const LOCATIONS: Location[] = [
  { id: "desk_maya", name: "Maya's desk", tile: { x: 4, y: 5 }, kind: "desk", ownerAgentId: "maya" },
  { id: "desk_tobias", name: "Tobias's desk", tile: { x: 9, y: 5 }, kind: "desk", ownerAgentId: "tobias" },
  { id: "desk_lynn", name: "Lynn's desk", tile: { x: 14, y: 5 }, kind: "desk", ownerAgentId: "lynn" },

  { id: "desk_riley", name: "Riley's desk", tile: { x: 19, y: 5 }, kind: "desk", ownerAgentId: "riley" },
  { id: "coffee", name: "Coffee machine", tile: { x: 2, y: 12 }, kind: "coffee" },
  { id: "meeting_table", name: "Meeting table", tile: { x: 11, y: 10 }, kind: "meeting" },
  { id: "wander_a", name: "Hallway A", tile: { x: 6, y: 7 }, kind: "wander" },
  { id: "wander_b", name: "Hallway B", tile: { x: 17, y: 12 }, kind: "wander" },
  { id: "wander_c", name: "Window", tile: { x: 21, y: 2 }, kind: "wander" },
];

export const SOULS: Soul[] = [
  {
    id: "maya",
    name: "Maya",
    role: "Engineering lead",
    voice: "short, dry, one sentence",
    traits: ["decisive", "skeptical", "precise"],
    goal: "Ship the next release without drama",
    barkLines: [
      "Ship it.",
      "Tests first.",
      "What's the actual blocker?",
      "I'll take a look after coffee.",
    ],
    color: "#e85d4c",
    temperature: 0.55,
  },
  {
    id: "tobias",
    name: "Tobias",
    role: "Product",
    voice: "curious, warm, slightly too many questions",
    traits: ["curious", "optimistic", "meeting-happy"],
    goal: "Keep the roadmap honest and the team aligned",
    barkLines: [
      "Quick sync?",
      "Users would love that.",
      "Can we timebox this?",
      "I'll put it on the board.",
    ],
    color: "#4c8fe8",
    temperature: 0.75,
    spriteKey: "tobias",
  },
  {
    id: "lynn",
    name: "Lynn",
    role: "Designer",
    voice: "observant, soft, visual metaphors",
    traits: ["observant", "coffee-motivated", "tasteful"],
    goal: "Make the product feel intentional",
    barkLines: [
      "Needs more whitespace.",
      "Coffee first.",
      "That hierarchy feels off.",
      "Let me sketch it.",
    ],
    color: "#7bc47f",
    temperature: 0.7,
    spriteKey: "lynn",
  },


  {
    id: "riley",
    name: "Riley",
    role: "Ops",
    voice: "practical, closes loops, no fluff",
    traits: ["practical", "reliable", "deadline-aware"],
    goal: "Close open loops before they become fires",
    barkLines: [
      "I'll follow up.",
      "Done.",
      "Owner and deadline?",
      "Parking that for Friday.",
    ],
    color: "#c9a227",
    temperature: 0.5,
  },
];

function agentFromSoul(soul: Soul, tile: { x: number; y: number }, deskId: string): AgentState {
  return {
    soul,
    tile,
    pos: { x: tile.x, y: tile.y },
    path: [],
    intention: { kind: "go_work", locationId: deskId },
    status: "idle",
    socialNeed: 0.35 + Math.random() * 0.2,
    taskProgress: 0,
    facing: "down",
  };
}

export function createSeedAgents(): AgentState[] {
  return [
    agentFromSoul(SOULS[0]!, { x: 4, y: 5 }, "desk_maya"),
    agentFromSoul(SOULS[1]!, { x: 9, y: 5 }, "desk_tobias"),
    agentFromSoul(SOULS[2]!, { x: 14, y: 5 }, "desk_lynn"),

    agentFromSoul(SOULS[3]!, { x: 19, y: 5 }, "desk_riley"),
  ];
}

export function createSeedRelationships(): Relationship[] {
  const ids = SOULS.map((s) => s.id);
  const out: Relationship[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push({ a: ids[i]!, b: ids[j]!, warmth: 0.15 });
    }
  }
  return out;
}

export function locationById(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

export function deskForAgent(agentId: string): Location | undefined {
  return LOCATIONS.find((l) => l.ownerAgentId === agentId);
}

function migrateIntention(intention: Intention): Intention {
  return {
    ...intention,
    locationId: intention.locationId
      ? migrateAgentId(intention.locationId)
      : intention.locationId,
    targetAgentId: intention.targetAgentId
      ? migrateAgentId(intention.targetAgentId)
      : intention.targetAgentId,
  };
}

function soulById(id: string): Soul | undefined {
  return SOULS.find((s) => s.id === id);
}

/** Rewrite persisted Leo/Sam cast to Tobias/Lynn and refresh soul definitions. */
export function migrateWorldCast(data: {
  simMs: number;
  agents: AgentState[];
  conversations: Conversation[];
  memories: MemoryFact[];
  relationships: Relationship[];
  tokens: WorldSnapshot["tokens"];
}): {
  simMs: number;
  agents: AgentState[];
  conversations: Conversation[];
  memories: MemoryFact[];
  relationships: Relationship[];
  tokens: WorldSnapshot["tokens"];
} {
  const seen = new Set<string>();
  const agents: AgentState[] = [];

  for (const agent of data.agents) {
    const id = migrateAgentId(agent.soul.id);
    if (seen.has(id)) continue;
    const soul = soulById(id);
    if (!soul) continue;
    seen.add(id);
    agents.push({
      ...agent,
      soul,
      intention: migrateIntention(agent.intention),
      pos: agent.pos ?? { x: agent.tile.x, y: agent.tile.y },
    });
  }

  for (const seeded of createSeedAgents()) {
    if (seen.has(seeded.soul.id)) continue;
    agents.push(seeded);
    seen.add(seeded.soul.id);
  }

  const conversations = data.conversations.map((c) => ({
    ...c,
    participantIds: c.participantIds.map(migrateAgentId),
    locationId: c.locationId ? migrateAgentId(c.locationId) : c.locationId,
    lines: c.lines.map((l) => ({
      ...l,
      speakerId: migrateAgentId(l.speakerId),
    })),
  }));

  const memories = data.memories.map((m) => ({
    ...m,
    agentId: migrateAgentId(m.agentId),
    about: migrateAgentId(m.about),
  }));

  const relSeen = new Set<string>();
  const relationships: Relationship[] = [];
  for (const r of data.relationships) {
    const a = migrateAgentId(r.a);
    const b = migrateAgentId(r.b);
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (relSeen.has(key)) continue;
    relSeen.add(key);
    relationships.push({ a, b, warmth: r.warmth });
  }
  for (const seeded of createSeedRelationships()) {
    const key = seeded.a < seeded.b ? `${seeded.a}|${seeded.b}` : `${seeded.b}|${seeded.a}`;
    if (relSeen.has(key)) continue;
    relSeen.add(key);
    relationships.push(seeded);
  }

  return {
    simMs: data.simMs,
    agents,
    conversations,
    memories,
    relationships,
    tokens: data.tokens,
  };
}

/**
 * Client-side overlay: rewrite Leo/Sam → Tobias/Lynn (ids, names, sprites).
 * Use {@link resolveServerAgentId} when sending join commands to an unmigrated host.
 */
export function overlayCanonicalSouls(snapshot: WorldSnapshot): WorldSnapshot {
  return {
    ...snapshot,
    agents: snapshot.agents.map((agent) => {
      const canonId = migrateAgentId(agent.soul.id);
      const soul = soulById(canonId);
      if (!soul) return agent;
      return {
        ...agent,
        soul: { ...soul },
        intention: migrateIntention(agent.intention),
      };
    }),
    bubble: snapshot.bubble
      ? {
          ...snapshot.bubble,
          agentId: migrateAgentId(snapshot.bubble.agentId),
        }
      : snapshot.bubble,
    activeConversationId: snapshot.activeConversationId,
    conversations: snapshot.conversations.map((c) => ({
      ...c,
      participantIds: c.participantIds.map(migrateAgentId),
      locationId: c.locationId ? migrateAgentId(c.locationId) : c.locationId,
      lines: c.lines.map((l) => ({
        ...l,
        speakerId: migrateAgentId(l.speakerId),
      })),
    })),
  };
}

/** Map a canonical cast id back to whatever id the live host still uses. */
export function resolveServerAgentId(
  canonicalId: string,
  serverAgentIds: readonly string[],
): string {
  if (serverAgentIds.includes(canonicalId)) return canonicalId;
  for (const [from, to] of Object.entries(AGENT_ID_MIGRATIONS)) {
    if (to === canonicalId && serverAgentIds.includes(from)) return from;
  }
  return canonicalId;
}
