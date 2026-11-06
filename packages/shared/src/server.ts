import { z } from "zod";
import { WorldSnapshotSchema } from "./models.js";

export const AwayEventSchema = z.object({
  id: z.string(),
  at: z.number(),
  agentId: z.string(),
  agentName: z.string(),
  text: z.string(),
});
export type AwayEvent = z.infer<typeof AwayEventSchema>;

export const ServerMetaSchema = z.object({
  uptimeMs: z.number(),
  clients: z.number().int(),
  startedAt: z.number(),
  awayLog: z.array(AwayEventSchema),
  hasServerKey: z.boolean(),
});
export type ServerMeta = z.infer<typeof ServerMetaSchema>;

export const HostPayloadSchema = z.object({
  snapshot: WorldSnapshotSchema,
  server: ServerMetaSchema,
});
export type HostPayload = z.infer<typeof HostPayloadSchema>;
