import { z } from "zod";

export const IntentionKindSchema = z.enum([
  "go_work",
  "get_coffee",
  "wander",
  "attend_meeting",
  "talk",
  "wait",
]);
export type IntentionKind = z.infer<typeof IntentionKindSchema>;

export const TileSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});
export type Tile = z.infer<typeof TileSchema>;

export const IntentionSchema = z.object({
  kind: IntentionKindSchema,
  locationId: z.string().optional(),
  targetAgentId: z.string().optional(),
  untilSimMs: z.number().optional(),
});
export type Intention = z.infer<typeof IntentionSchema>;

export const AgentStatusSchema = z.enum([
  "walking",
  "working",
  "talking",
  "idle",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const SoulSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  voice: z.string(),
  traits: z.array(z.string()),
  goal: z.string(),
  barkLines: z.array(z.string()),
  color: z.string(),
  temperature: z.number().min(0).max(1).default(0.7),
  /** Folder under /sprites/{spriteKey}/ with north/south/east/west pngs */
  spriteKey: z.string().optional(),
});
export type Soul = z.infer<typeof SoulSchema>;


export const PosSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Pos = z.infer<typeof PosSchema>;

export const AgentStateSchema = z.object({
  soul: SoulSchema,
  tile: TileSchema,
  /** Continuous position in tile units for smooth rendering */
  pos: PosSchema,
  path: z.array(TileSchema),
  intention: IntentionSchema,
  status: AgentStatusSchema,
  socialNeed: z.number().min(0).max(1),
  taskProgress: z.number().min(0).max(1),
  facing: z.enum(["up", "down", "left", "right"]).default("down"),
});
export type AgentState = z.infer<typeof AgentStateSchema>;


export const ConversationLineSchema = z.object({
  speakerId: z.string(),
  text: z.string(),
  at: z.number().optional(),
});
export type ConversationLine = z.infer<typeof ConversationLineSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  participantIds: z.array(z.string()),
  mode: z.enum(["scripted", "live"]),
  generation: z.number().int(),
  lines: z.array(ConversationLineSchema),
  cursor: z.number().int(),
  locationId: z.string().optional(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MemoryFactSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  about: z.string(),
  text: z.string(),
  at: z.number(),
});
export type MemoryFact = z.infer<typeof MemoryFactSchema>;

export const RelationshipSchema = z.object({
  a: z.string(),
  b: z.string(),
  warmth: z.number().min(-1).max(1),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  tile: TileSchema,
  kind: z.enum(["desk", "coffee", "meeting", "wander"]),
  ownerAgentId: z.string().optional(),
});
export type Location = z.infer<typeof LocationSchema>;

export const AmbientScriptSchema = z.object({
  lines: z
    .array(
      z.object({
        speakerId: z.string(),
        text: z.string().max(140),
      }),
    )
    .max(6),
  intentions: z.array(
    z.object({
      agentId: z.string(),
      kind: IntentionKindSchema,
      locationId: z.string().optional(),
      targetAgentId: z.string().optional(),
    }),
  ),
});
export type AmbientScript = z.infer<typeof AmbientScriptSchema>;

export const TokenUsageSchema = z.object({
  ambientUsed: z.number().int().nonnegative(),
  ambientCap: z.number().int().positive(),
  chatUsed: z.number().int().nonnegative(),
  chatCap: z.number().int().positive(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const WorldSnapshotSchema = z.object({
  simMs: z.number(),
  paused: z.boolean(),
  mapWidth: z.number().int(),
  mapHeight: z.number().int(),
  agents: z.array(AgentStateSchema),
  conversations: z.array(ConversationSchema),
  activeConversationId: z.string().nullable(),
  bubble: z
    .object({
      agentId: z.string(),
      text: z.string(),
    })
    .nullable(),
  tokens: TokenUsageSchema,
  hasApiKey: z.boolean(),
  ambientBudgetClosed: z.boolean(),
  toast: z.string().nullable(),
  meetingDue: z.boolean(),
});
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;

export const OfficeCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("join"), conversationId: z.string().optional(), agentId: z.string().optional() }),
  z.object({ type: z.literal("closeChat") }),
  z.object({ type: z.literal("send"), text: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("setApiKey"), key: z.string() }),
  z.object({ type: z.literal("clearApiKey") }),
  z.object({ type: z.literal("clickTile"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("dismissToast") }),
]);
export type OfficeCommand = z.infer<typeof OfficeCommandSchema>;

export const MODELS = {
  ambient: "grok-4-fast-non-reasoning",
  live: "grok-4-fast-non-reasoning",
} as const;

export const DEFAULT_TOKEN_CAPS = {
  ambientCap: 40_000,
  chatCap: 80_000,
} as const;

export const USER_ID = "user" as const;
