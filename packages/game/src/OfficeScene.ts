import Phaser from "phaser";
import {
  LOCATIONS,
  MAP_HEIGHT,
  MAP_WIDTH,
  OFFICE_COLLISION,
  SOULS,
  migrateAgentId,
  type WorldSnapshot,
} from "@office-sim/shared";

const TILE = 32;
/** Extra tiles of ground shown around the outer walls. */
const VIEW_PAD_TILES = 2.5;
const DIRS = [
  "north",
  "south",
  "east",
  "west",
  "north-east",
  "north-west",
  "south-east",
  "south-west",
] as const;
const SPRITE_KEYS = ["lynn", "tobias"] as const;

function displaySoul(agent: WorldSnapshot["agents"][number]): {
  id: string;
  name: string;
  color: string;
  spriteKey?: string;
} {
  const canonId = migrateAgentId(agent.soul.id);
  const seeded = SOULS.find((s) => s.id === canonId);
  if (seeded) {
    return {
      id: agent.soul.id,
      name: seeded.name,
      color: seeded.color,
      spriteKey: seeded.spriteKey,
    };
  }
  return {
    id: agent.soul.id,
    name: agent.soul.name,
    color: agent.soul.color,
    spriteKey: agent.soul.spriteKey,
  };
}

export type GameCallbacks = {
  onAgentClick: (agentId: string) => void;
};

type MoveTarget = { x: number; y: number; walking: boolean };

function facingToDir(facing: string): (typeof DIRS)[number] {
  switch (facing) {
    case "up":
      return "north";
    case "down":
      return "south";
    case "left":
      return "west";
    case "right":
      return "east";
    default:
      return "south";
  }
}

function texKey(spriteKey: string, dir: string): string {
  return `agent-${spriteKey}-${dir}`;
}

export class OfficeScene extends Phaser.Scene {
  private callbacks: GameCallbacks;
  private agentSprites = new Map<string, Phaser.GameObjects.Container>();
  private moveTargets = new Map<string, MoveTarget>();
  private bubbleText: Phaser.GameObjects.Text | null = null;
  private latest: WorldSnapshot | null = null;
  private readonly pixelSpeed = 3.2 * TILE;
  private assetsReady = false;

  constructor(callbacks: GameCallbacks) {
    super("OfficeScene");
    this.callbacks = callbacks;
  }

  preload(): void {
    for (const key of SPRITE_KEYS) {
      for (const dir of DIRS) {
        this.load.image(texKey(key, dir), `/sprites/${key}/${dir}.png`);
      }
    }
  }

  create(): void {
    for (const key of SPRITE_KEYS) {
      for (const dir of DIRS) {
        this.makeBlackTransparent(texKey(key, dir));
      }
    }
    this.assetsReady = true;

    this.cameras.main.setBackgroundColor("#0a1018");
    this.drawSurroundings();
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

    this.fitCamera();
    this.scale.on("resize", () => this.fitCamera());

    if (this.latest) this.applySnapshot(this.latest);
  }

  private fitCamera(): void {
    const worldW = (MAP_WIDTH + VIEW_PAD_TILES * 2) * TILE;
    const worldH = (MAP_HEIGHT + VIEW_PAD_TILES * 2) * TILE;
    const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
    this.cameras.main.setZoom(Math.max(0.05, zoom));
    this.cameras.main.centerOn((MAP_WIDTH * TILE) / 2, (MAP_HEIGHT * TILE) / 2);
  }

  private drawSurroundings(): void {
    const g = this.add.graphics().setDepth(0);
    const pad = Math.ceil(VIEW_PAD_TILES) + 2;
    const x0 = -pad * TILE;
    const y0 = -pad * TILE;
    const w = (MAP_WIDTH + pad * 2) * TILE;
    const h = (MAP_HEIGHT + pad * 2) * TILE;

    g.fillStyle(0x0a1018, 1);
    g.fillRect(x0, y0, w, h);

    for (let y = -pad; y < MAP_HEIGHT + pad; y++) {
      for (let x = -pad; x < MAP_WIDTH + pad; x++) {
        if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) continue;
        const px = x * TILE;
        const py = y * TILE;
        const checker = (x + y) % 2 === 0 ? 0x141c2a : 0x111824;
        g.fillStyle(checker, 1);
        g.fillRect(px, py, TILE, TILE);
      }
    }

    g.lineStyle(3, 0x243044, 0.9);
    g.strokeRect(-4, -4, MAP_WIDTH * TILE + 8, MAP_HEIGHT * TILE + 8);
  }

  private makeBlackTransparent(key: string): void {
    if (!this.textures.exists(key)) return;
    const src = this.textures.get(key).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;
    const w = src.width;
    const h = src.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i]! < 18 && d[i + 1]! < 18 && d[i + 2]! < 18) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
  }

  private drawFloor(): void {
    const floor = this.add.graphics().setDepth(1);
    const walls = this.add.graphics().setDepth(2);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const blocked = OFFICE_COLLISION[y]![x] === 1;
        const px = x * TILE;
        const py = y * TILE;
        if (blocked) continue;
        const checker = (x + y) % 2 === 0 ? 0x3d4a63 : 0x364257;
        floor.fillStyle(checker, 1);
        floor.fillRect(px, py, TILE, TILE);
        floor.lineStyle(1, 0x2a3346, 0.35);
        floor.strokeRect(px, py, TILE, TILE);
      }
    }

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (OFFICE_COLLISION[y]![x] !== 1) continue;
        const px = x * TILE;
        const py = y * TILE;
        // Wall body
        walls.fillStyle(0x5a6578, 1);
        walls.fillRect(px, py, TILE, TILE);
        // Top face / cap so walls read as solid building edge
        walls.fillStyle(0x7a8699, 1);
        walls.fillRect(px, py, TILE, 8);
        // Inner shadow edge
        walls.fillStyle(0x2e3648, 1);
        walls.fillRect(px, py + TILE - 5, TILE, 5);
        walls.lineStyle(1, 0x1b2230, 0.85);
        walls.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  private drawFurniture(): void {
    for (const loc of LOCATIONS) {
      const px = loc.tile.x * TILE;
      const py = loc.tile.y * TILE;
      const g = this.add.graphics().setDepth(3);
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
    if (!this.assetsReady || !this.add) {
      // scene not ready yet; create() will re-apply
      return;
    }

    const seen = new Set<string>();

    for (const agent of snap.agents) {
      seen.add(agent.soul.id);
      const spriteKey =
        agent.soul.spriteKey ??
        ((SPRITE_KEYS as readonly string[]).includes(agent.soul.id)
          ? agent.soul.id
          : undefined);
      let container = this.agentSprites.get(agent.soul.id);
      const wantAvatar = Boolean(
        spriteKey && this.textures.exists(texKey(spriteKey, "south")),
      );
      if (container) {
        const hasAvatar = Boolean(container.getData("avatar"));
        const label = container.getData("nameLabel") as Phaser.GameObjects.Text | undefined;
        if (label && label.text !== agent.soul.name) label.setText(agent.soul.name);
        if (hasAvatar !== wantAvatar) {
          container.destroy();
          this.agentSprites.delete(agent.soul.id);
          this.moveTargets.delete(agent.soul.id);
          container = undefined;
        }
      }
      if (!container) {
        container = this.createAgentSprite(
          agent.soul.id,
          agent.soul.color,
          agent.soul.name,
          spriteKey,
        );
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

      this.updateAgentVisual(container, spriteKey, agent.facing, agent.status, snap.simMs);
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
            (sprite?.y ?? (agent.pos?.y ?? agent.tile.y) * TILE + TILE / 2) - TILE / 2 - 14,
          )
          .setOrigin(0.5, 1)
          .setVisible(true);
      }
    } else if (this.bubbleText) {
      this.bubbleText.setVisible(false);
    }
  }

  private updateAgentVisual(
    container: Phaser.GameObjects.Container,
    spriteKey: string | undefined,
    facing: string,
    status: string,
    simMs: number,
  ): void {
    const statusText = container.getData("statusText") as Phaser.GameObjects.Text;
    const bob = status === "walking" ? Math.sin(simMs / 80) * 2 : 0;

    const avatar = container.getData("avatar") as Phaser.GameObjects.Image | null;
    const body = container.getData("body") as Phaser.GameObjects.Rectangle | null;
    const head = container.getData("head") as Phaser.GameObjects.Rectangle | null;

    if (spriteKey && avatar) {
      const dir = facingToDir(facing);
      const key = texKey(spriteKey, dir);
      if (this.textures.exists(key) && avatar.texture.key !== key) {
        avatar.setTexture(key);
      }
      avatar.setY(bob);
      avatar.setAlpha(status === "working" ? 0.9 : 1);
    } else if (body && head) {
      body.setY(bob);
      head.setY(-12 + bob);
      body.setScale(1, status === "walking" ? 1 + Math.abs(bob) * 0.02 : 1);
      if (facing === "left") body.setAngle(-4);
      else if (facing === "right") body.setAngle(4);
      else body.setAngle(0);
    }

    statusText.setText(
      status === "working" ? ".." : status === "talking" ? "*" : status === "walking" ? "" : "",
    );
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
      const speed = this.pixelSpeed * (target.walking ? 1.15 : 2.5);
      const step = Math.min(dist, speed * dt);
      container.x += (dx / dist) * step;
      container.y += (dy / dist) * step;
    }

    if (this.latest?.bubble && this.bubbleText?.visible) {
      const agentId = this.latest.bubble.agentId;
      const sprite = this.agentSprites.get(agentId);
      if (sprite) {
        this.bubbleText.setPosition(sprite.x, sprite.y - TILE / 2 - 14);
      }
    }
  }

  private createAgentSprite(
    id: string,
    color: string,
    name: string,
    spriteKey?: string,
  ): Phaser.GameObjects.Container {
    const label = this.add
      .text(0, 20, name, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#e8eef8",
      })
      .setOrigin(0.5, 0);
    const statusText = this.add
      .text(12, -20, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#fff",
      })
      .setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [];
    let avatar: Phaser.GameObjects.Image | null = null;
    let body: Phaser.GameObjects.Rectangle | null = null;
    let head: Phaser.GameObjects.Rectangle | null = null;

    if (spriteKey && this.textures.exists(texKey(spriteKey, "south"))) {
      avatar = this.add.image(0, 0, texKey(spriteKey, "south"));
      avatar.setDisplaySize(40, 40);
      avatar.setOrigin(0.5, 0.7);
      children.push(avatar);
    } else {
      const colorNum = Phaser.Display.Color.HexStringToColor(color).color;
      body = this.add.rectangle(0, 0, 18, 22, colorNum);
      body.setStrokeStyle(2, 0x0d1118);
      head = this.add.rectangle(0, -12, 12, 10, 0xf2d6b3);
      head.setStrokeStyle(1, 0x0d1118);
      children.push(body, head);
    }

    children.push(statusText, label);
    const container = this.add.container(0, 0, children);
    container.setSize(28, 36);
    container.setDepth(10);
    container.setData("statusText", statusText);
    container.setData("nameLabel", label);
    if (avatar) container.setData("avatar", avatar);
    if (body) container.setData("body", body);
    if (head) container.setData("head", head);
    container.setData("spriteKey", spriteKey ?? null);

    container.setInteractive(
      new Phaser.Geom.Rectangle(-14, -18, 28, 36),
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
    backgroundColor: "#0a1018",
    pixelArt: true,
    roundPixels: true,
    scene: [scene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: parent.clientWidth || 1280,
      height: parent.clientHeight || 720,
    },
  });
  return { game, scene };
}
