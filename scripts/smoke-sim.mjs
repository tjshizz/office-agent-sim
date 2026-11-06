import { createRequire } from "node:module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Build packages first is expected; import from source via tsx alternative:
// Use dynamic import of compiled dist if present, else fail clearly.

async function main() {
  let World;
  try {
    ({ World } = await import("../packages/sim/dist/index.js"));
  } catch {
    console.error("Build @office-sim/sim first: pnpm --filter @office-sim/shared build && pnpm --filter @office-sim/sim build");
    process.exit(1);
  }

  const world = new World();
  world.setHasApiKey(false);

  for (let i = 0; i < 300; i++) world.tick(); // 30s sim

  const snap = world.snapshot();
  console.log("agents", snap.agents.length);
  console.log(
    "statuses",
    snap.agents.map((a) => `${a.soul.name}:${a.status}@${a.tile.x},${a.tile.y}`).join(" | "),
  );
  console.log("simMs", snap.simMs);
  console.log("conversations", snap.conversations.length);
  console.log("bubble", snap.bubble);
  console.log("ambientBudgetClosed", snap.ambientBudgetClosed);

  const joined = world.join({ agentId: "maya" });
  console.log("joined", joined?.id, joined?.mode);
  world.appendUserLine("What are you working on?");
  world.rememberFact("maya", "user", "Likes short answers");
  world.assignTask("tobias", "get_coffee", "coffee");
  console.log("memories", world.memories.length);
  console.log("tobias intention", world.agents.find((a) => a.soul.id === "tobias")?.intention);

  if (snap.agents.length !== 4) throw new Error("expected 4 agents");
  if (!snap.ambientBudgetClosed) throw new Error("expected bark mode without key");
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
