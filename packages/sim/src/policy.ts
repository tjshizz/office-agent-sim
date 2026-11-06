import {
  LOCATIONS,
  deskForAgent,
  locationById,
  type AgentState,
  type Intention,
  type Relationship,
} from "@office-sim/shared";
import { findPath } from "./pathfinding.js";

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function applyIntention(
  agent: AgentState,
  intention: Intention,
  allAgents?: AgentState[],
): void {
  agent.intention = intention;
  agent.taskProgress = 0;

  if (intention.kind === "talk" && intention.targetAgentId) {
    agent.status = "talking";
    agent.path = [];
    return;
  }

  if (intention.kind === "wait") {
    agent.status = "idle";
    agent.path = [];
    return;
  }

  // Social seek: walk toward another agent
  if (intention.kind === "wander" && intention.targetAgentId && allAgents) {
    const target = allAgents.find((a) => a.soul.id === intention.targetAgentId);
    if (target) {
      agent.path = findPath(agent.tile, target.tile);
      agent.status = agent.path.length ? "walking" : "idle";
      return;
    }
  }

  const locId =
    intention.locationId ??
    (intention.kind === "go_work"
      ? deskForAgent(agent.soul.id)?.id
      : intention.kind === "get_coffee"
        ? "coffee"
        : intention.kind === "attend_meeting"
          ? "meeting_table"
          : undefined);

  if (!locId) {
    const wander = LOCATIONS.filter((l) => l.kind === "wander");
    const pick = wander[Math.floor(Math.random() * wander.length)]!;
    agent.path = findPath(agent.tile, pick.tile);
    agent.status = agent.path.length ? "walking" : "idle";
    agent.intention = { kind: "wander", locationId: pick.id };
    return;
  }


  const loc = locationById(locId);
  if (!loc) {
    agent.status = "idle";
    agent.path = [];
    return;
  }

  agent.intention = { ...intention, locationId: locId };
  agent.path = findPath(agent.tile, loc.tile);
  agent.status = agent.path.length ? "walking" : intention.kind === "go_work" ? "working" : "idle";
}

export function pickNextIntention(agent: AgentState, all: AgentState[], meetingDue: boolean): Intention {
  if (meetingDue) {
    return { kind: "attend_meeting", locationId: "meeting_table" };
  }

  if (agent.socialNeed > 0.65) {
    const others = all
      .filter((o) => o.soul.id !== agent.soul.id && o.status !== "talking")
      .map((o) => ({ o, d: manhattan(agent.tile, o.tile) }))
      .sort((a, b) => a.d - b.d);
    const nearest = others[0];
    if (nearest) {
      if (nearest.d <= 2) {
        return { kind: "talk", targetAgentId: nearest.o.soul.id };
      }
      // walk toward coworker (pathfinding uses their tile as a wander target)
      return {
        kind: "wander",
        locationId: undefined,
        targetAgentId: nearest.o.soul.id,
      };
    }
  }


  if (agent.socialNeed > 0.55 && Math.random() < 0.35) {
    return { kind: "get_coffee", locationId: "coffee" };
  }

  if (Math.random() < 0.15) {
    const wander = LOCATIONS.filter((l) => l.kind === "wander");
    const pick = wander[Math.floor(Math.random() * wander.length)]!;
    return { kind: "wander", locationId: pick.id };
  }

  return { kind: "go_work", locationId: deskForAgent(agent.soul.id)?.id };
}

export function pickSocialPair(
  agents: AgentState[],
  relationships: Relationship[],
): [AgentState, AgentState] | null {
  const candidates: { a: AgentState; b: AgentState; score: number }[] = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i]!;
      const b = agents[j]!;
      if (a.status === "talking" || b.status === "talking") continue;
      const d = manhattan(a.tile, b.tile);
      if (d > 5) continue;
      const rel =
        relationships.find(
          (r) =>
            (r.a === a.soul.id && r.b === b.soul.id) ||
            (r.a === b.soul.id && r.b === a.soul.id),
        )?.warmth ?? 0;
      const score = a.socialNeed + b.socialNeed + rel * 0.3 - d * 0.05;
      candidates.push({ a, b, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  const best = candidates[0];
  if (!best || best.score < 0.9) return null;
  return [best.a, best.b];
}

export function barkLine(agent: AgentState): string {
  const lines = agent.soul.barkLines;
  return lines[Math.floor(Math.random() * lines.length)] ?? "...";
}
