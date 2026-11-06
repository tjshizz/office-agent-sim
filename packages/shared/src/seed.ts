import type { AgentState, Location, Relationship, Soul } from "./models.js";

export const MAP_WIDTH = 24;
export const MAP_HEIGHT = 16;

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
  { id: "desk_leo", name: "Leo's desk", tile: { x: 9, y: 5 }, kind: "desk", ownerAgentId: "leo" },
  { id: "desk_sam", name: "Sam's desk", tile: { x: 14, y: 5 }, kind: "desk", ownerAgentId: "sam" },
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
    id: "leo",
    name: "Leo",
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
  },
  {
    id: "sam",
    name: "Sam",
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
    agentFromSoul(SOULS[1]!, { x: 9, y: 5 }, "desk_leo"),
    agentFromSoul(SOULS[2]!, { x: 14, y: 5 }, "desk_sam"),
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
