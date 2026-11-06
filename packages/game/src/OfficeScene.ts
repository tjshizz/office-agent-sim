import Phaser from "phaser";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  OFFICE_COLLISION,
  LOCATIONS,
  type WorldSnapshot,
} from "@office-sim/shared";

const TILE = 32;

export type GameCallbacks = {
  onAgentClick: (agentId: string) => void;
};


type MoveTarget = { x: number; y: number; walking: boolean };

export class OfficeScene extends Phaser.Scene {
  private callbacks: GameCallbacks;
  private agentSprites = new Map<string, Phaser.GameObjects.Container>();
  private moveTargets = new Map<string, MoveTarget>();
  private bubbleText: Phaser.GameObjects.Text | null = null;
  private latest: WorldSnapshot | null = null;
  private readonly pixelSpeed = 3.2 * TILE; // match sim TILES_PER_SEC

  constructor(callbacks: GameCallbacks) {
    super("OfficeScene");
    this.callbacks = callbacks;
  }


  create(): void {
    this.cameras.main.setBackgroundColor("#1a1f2e");
    this.drawFloor();
    this.drawFurniture();
    this.bubbleText = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#1a1a1a",
        backgroundColor: "#f5f0e6",
        padding: { x: 6, y: 4 },
        wordWrap: { width: 140 },
      })
      .setDepth(20)
      .setVisible(false);

    const zoom = Math.min(

      this.scale.width / (MAP_WIDTH * TILE),
      this.scale.height / (MAP_HEIGHT * TILE),
    );
    this.cameras.main.setZoom(Math.max(1, Math.floor(zoom * 10) / 10));
    this.cameras.main.centerOn((MAP_WIDTH * TILE) / 2, (MAP_HEIGHT * TILE) / 2);
  }

  private drawFloor(): void {
    const g = this.add.graphics();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const blocked = OFFICE_COLLISION[y]![x] === 1;
        const px = x * TILE;
        const py = y * TILE;
        if (blocked) {
          g.fillStyle(0x2b3348, 1);
          g.fillRect(px, py, TILE, TILE);
        } else {
          const checker = (x + y) % 2 === 0 ? 0x3d4a63 : 0x364257;
          g.fillStyle(checker, 1);
          g.fillRect(px, py, TILE, TILE);
          g.lineStyle(1, 0x2a3346, 0.35);
          g.strokeRect(px, py, TILE, TILE);
        }
      }
    }
  }

  private drawFurniture(): void {
    for (const loc of LOCATIONS) {
      const px = loc.tile.x * TILE;
      const py = loc.tile.y * TILE;
      const g = this.add.graphics();
      if (loc.kind === "desk") {
        g.fillStyle(0x8b6914, 1);
        g.fillRect(px + 4, py + 8, TILE - 8, TILE - 12);
        g.fillStyle(0xc4a35a, 1);
        g.fillRect(px + 6, py + 4, TILE - 12, 8);
      } else if (loc.kind === "coffee") {
        g.fillStyle(0x5c4033, 1);
        g.fillRect(px + 8, py + 6, TILE - 16, TILE - 10);
        g.fillStyle(0xd4a574, 1);
        g.fillCircle(px + TILE / 2, py + TILE / 2 - 2, 5);
      } else if (loc.kind === "meeting") {
        g.fillStyle(0x6b4f2a, 1);
        g.fillRect(px - TILE, py - 4, TILE * 3, TILE + 8);
        g.fillStyle(0x4a3720, 1);
        g.fillRect(px - TILE + 4, py, TILE * 3 - 8, TILE);
      }
      this.add
        .text(px + TILE / 2, py - 4, loc.name.split(" ")[0]!, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#c8d0e0",
        })
        .setOrigin(0.5, 1)
        .setDepth(5);
    }
  }

  applySnapshot(snap: WorldSnapshot): void {
    this.latest = snap;
    const seen = new Set<string>();

    for (const agent of snap.agents) {
      seen.add(agent.soul.id);
      let container = this.agentSprites.get(agent.soul.id);
      if (!container) {
        container = this.createAgentSprite(agent.soul.id, agent.soul.color, agent.soul.name);
        this.agentSprites.set(agent.soul.id, container);
        const px = (agent.pos?.x ?? agent.tile.x) * TILE + TILE / 2;
        const py = (agent.pos?.y ?? agent.tile.y) * TILE + TILE / 2;
        container.setPosition(px, py);
      }

      const targetX = (agent.pos?.x ?? agent.tile.x) * TILE + TILE / 2;
      const targetY = (agent.pos?.y ?? agent.tile.y) * TILE + TILE / 2;
      this.moveTargets.set(agent.soul.id, {
        x: targetX,
        y: targetY,
        walking: agent.status === "walking",
      });

      const body = container.getAt(0) as Phaser.GameObjects.Rectangle;
      const head = container.getAt(1) as Phaser.GameObjects.Rectangle;
      const bob = agent.status === "walking" ? Math.sin(snap.simMs / 80) * 2 : 0;
      const workPulse =
        agent.status === "working" ? Math.sin(snap.simMs / 200) * 1.5 : 0;
      body.setY(bob);
      head.setY(-12 + bob);
      body.setScale(1, agent.status === "walking" ? 1 + Math.abs(bob) * 0.02 : 1);
      body.setAlpha(agent.status === "working" ? 0.85 + workPulse * 0.05 : 1);

      if (agent.facing === "left") body.setAngle(-4);
      else if (agent.facing === "right") body.setAngle(4);
      else body.setAngle(0);

      const status = container.getAt(2) as Phaser.GameObjects.Text;
      status.setText(
        agent.status === "working"
          ? ".."
          : agent.status === "talking"
            ? "*"
            : agent.status === "walking"
              ? ">"
              : "",
      );
    }

    for (const [id, sprite] of this.agentSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.agentSprites.delete(id);
        this.moveTargets.delete(id);
      }
    }

    if (snap.bubble && this.bubbleText) {
      const agent = snap.agents.find((a) => a.soul.id === snap.bubble!.agentId);
      if (agent) {
        const sprite = this.agentSprites.get(agent.soul.id);
        this.bubbleText
          .setText(snap.bubble.text)
          .setPosition(
            sprite?.x ?? (agent.pos?.x ?? agent.tile.x) * TILE + TILE / 2,
            (sprite?.y ?? (agent.pos?.y ?? agent.tile.y) * TILE + TILE / 2) - TILE / 2 - 10,
          )
          .setOrigin(0.5, 1)
          .setVisible(true);
      }
    } else if (this.bubbleText) {
      this.bubbleText.setVisible(false);
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    for (const [id, container] of this.agentSprites) {
      const target = this.moveTargets.get(id);
      if (!target) continue;
      const dx = target.x - container.x;
      const dy = target.y - container.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) {
        container.setPosition(target.x, target.y);
        continue;
      }
      // Catch up a bit faster than sim so we don't lag behind 10Hz snapshots
      const speed = this.pixelSpeed * (target.walking ? 1.15 : 2.5);
      const step = Math.min(dist, speed * dt);
      container.x += (dx / dist) * step;
      container.y += (dy / dist) * step;
    }

    if (this.latest?.bubble && this.bubbleText?.visible) {
      const agentId = this.latest.bubble.agentId;
      const sprite = this.agentSprites.get(agentId);
      if (sprite) {
        this.bubbleText.setPosition(sprite.x, sprite.y - TILE / 2 - 10);
      }
    }
  }

  private createAgentSprite(id: string, color: string, name: string): Phaser.GameObjects.Container {
    const colorNum = Phaser.Display.Color.HexStringToColor(color).color;
    const body = this.add.rectangle(0, 0, 18, 22, colorNum);
    body.setStrokeStyle(2, 0x0d1118);
    const head = this.add.rectangle(0, -12, 12, 10, 0xf2d6b3);
    head.setStrokeStyle(1, 0x0d1118);
    const label = this.add
      .text(0, 16, name, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#e8eef8",
      })
      .setOrigin(0.5, 0);
    const status = this.add
      .text(10, -18, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#fff",
      })
      .setOrigin(0.5);

    const container = this.add.container(0, 0, [body, head, status, label]);
    container.setSize(24, 32);
    container.setDepth(10);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-12, -16, 24, 32),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation?.();
      this.callbacks.onAgentClick(id);
    });
    return container;
  }
}

export function createGame(
  parent: HTMLElement,
  callbacks: GameCallbacks,
): { game: Phaser.Game; scene: OfficeScene } {
  const scene = new OfficeScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: parent.clientWidth || 960,
    height: parent.clientHeight || 640,
    backgroundColor: "#1a1f2e",
    pixelArt: true,
    roundPixels: true,
    scene: [scene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
  return { game, scene };
}
