import { MAP_HEIGHT, MAP_WIDTH, OFFICE_COLLISION, type Tile } from "@office-sim/shared";

type Node = { x: number; y: number; g: number; h: number; f: number; parent: Node | null };

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function heuristic(a: Tile, b: Tile): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
  return OFFICE_COLLISION[y]![x] === 0;
}

export function findPath(from: Tile, to: Tile): Tile[] {
  if (!isWalkable(to.x, to.y)) return [];
  if (from.x === to.x && from.y === to.y) return [];

  const open: Node[] = [];
  const closed = new Set<string>();
  const start: Node = {
    x: from.x,
    y: from.y,
    g: 0,
    h: heuristic(from, to),
    f: heuristic(from, to),
    parent: null,
  };
  open.push(start);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const ck = key(current.x, current.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (current.x === to.x && current.y === to.y) {
      const path: Tile[] = [];
      let n: Node | null = current;
      while (n && !(n.x === from.x && n.y === from.y)) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      return path.reverse();
    }

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const nb of neighbors) {
      if (!isWalkable(nb.x, nb.y)) continue;
      const nk = key(nb.x, nb.y);
      if (closed.has(nk)) continue;
      const g = current.g + 1;
      const h = heuristic(nb, to);
      open.push({ x: nb.x, y: nb.y, g, h, f: g + h, parent: current });
    }
  }

  return [];
}

export function facingFromStep(from: Tile, to: Tile): "up" | "down" | "left" | "right" {
  if (to.x > from.x) return "right";
  if (to.x < from.x) return "left";
  if (to.y > from.y) return "down";
  return "up";
}
