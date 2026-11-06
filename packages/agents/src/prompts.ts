import { LOCATIONS, type AgentState, type MemoryFact, type Relationship } from "@office-sim/shared";

export function ambientSystemPrompt(): string {
  const locs = LOCATIONS.map((l) => `${l.id} (${l.name})`).join(", ");
  return `You write short office dialogue for an 8-bit office sim.
Return ONLY JSON:
{
  "lines": [{"speakerId":"...","text":"..."}],  // max 6 lines, each max 140 chars
  "intentions": [{"agentId":"...","kind":"go_work|get_coffee|wander|attend_meeting|wait","locationId":"..."}]
}
Valid locationIds: ${locs}
Stay in character. No coordinates. No markdown.`;
}

export function ambientUserPrompt(
  kind: "pair" | "meeting",
  agents: AgentState[],
  simMs: number,
): string {
  const cards = agents
    .map(
      (a) =>
        `${a.soul.id}: ${a.soul.name}, ${a.soul.role}. Voice: ${a.soul.voice}. Traits: ${a.soul.traits.join(", ")}. Goal: ${a.soul.goal}. Status: ${a.status}.`,
    )
    .join("\n");
  if (kind === "meeting") {
    return `Office clock ms=${simMs}. Standup meeting at the table.\n${cards}\nWrite a brief 4-6 line standup.`;
  }
  return `Office clock ms=${simMs}. Two coworkers chat briefly in the office.\n${cards}\nWrite a natural 3-5 line exchange.`;
}

export function liveSystemPrompt(
  speakers: AgentState[],
  memories: MemoryFact[],
  relationships: Relationship[],
): string {
  const cards = speakers
    .map(
      (a) =>
        `You may speak as ${a.soul.name} (${a.soul.id}), ${a.soul.role}. Voice: ${a.soul.voice}. Traits: ${a.soul.traits.join(", ")}. Goal: ${a.soul.goal}.`,
    )
    .join("\n");
  const mem = memories
    .slice(-30)
    .map((m) => `- ${m.agentId} about ${m.about}: ${m.text}`)
    .join("\n");
  const rel = relationships
    .map((r) => `${r.a}<->${r.b}: warmth ${r.warmth.toFixed(2)}`)
    .join("; ");
  return `You are employees in a playful 8-bit office sim. The human user joined the conversation.
Stay in character. Reply in 1-3 short sentences. Prefer one speaker voice if multiple are present (alternate naturally).
You may call tools: remember_fact, assign_task, end_conversation.
${cards}
Memories:
${mem || "(none)"}
Relationships: ${rel || "(none)"}`;
}
