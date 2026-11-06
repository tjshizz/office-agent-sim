import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { MindQueue } from "@office-sim/agents";
import { OfficeCommandSchema, type WorldSnapshot } from "@office-sim/shared";
import { World } from "@office-sim/sim";
import { OfficeDb } from "../db";
import { KeyStore } from "../keystore";

let mainWindow: BrowserWindow | null = null;
let world: World;
let mind: MindQueue;
let db: OfficeDb;
let keys: KeyStore;
let tickTimer: NodeJS.Timeout | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let dirty = false;

function publish(extra?: Partial<{ stream: unknown }>): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const snapshot: WorldSnapshot = world.snapshot();
  mainWindow.webContents.send("office:snapshot", snapshot);
  if (extra?.stream !== undefined) {
    mainWindow.webContents.send("office:stream", extra.stream);
  }
}

function scheduleSave(): void {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    db.saveWorld({
      simMs: world.simMs,
      agents: world.agents,
      conversations: world.conversations,
      memories: world.memories,
      relationships: world.relationships,
      tokens: world.tokens,
    });
  }, 2000);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    title: "Office Agent Sim",
    backgroundColor: "#070b12",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setAspectRatio(16 / 9);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

async function bootWorld(): Promise<void> {
  keys = new KeyStore(app.getPath("userData"));
  db = new OfficeDb(app.getPath("userData"));
  await db.ensureReady();

  world = new World({
    onDirty: () => {
      publish();
      scheduleSave();
    },
  });


  mind = new MindQueue(
    world,
    () => keys.load(),
    (payload) => {
      if (payload.token) {
        mainWindow?.webContents.send("office:stream", {
          type: "token",
          conversationId: payload.conversationId,
          generation: payload.generation,
          token: payload.token,
          speakerId: payload.speakerId,
        });
      }
      if (payload.toolNote) {
        mainWindow?.webContents.send("office:stream", {
          type: "tool",
          note: payload.toolNote,
        });
      }
      if (payload.done) {
        mainWindow?.webContents.send("office:stream", {
          type: "done",
          conversationId: payload.conversationId,
          generation: payload.generation,
        });
        publish();
      }
    },
  );

  const saved = db.loadWorld();
  if (saved) {
    world.loadState(saved);
  }
  world.setHasApiKey(Boolean(keys.load()));

  tickTimer = setInterval(() => {
    world.tick();
  }, 100);

  publish();
}


function handleCommand(raw: unknown): void {
  const parsed = OfficeCommandSchema.safeParse(raw);
  if (!parsed.success) {
    world.setToast("Invalid command");
    return;
  }
  const cmd = parsed.data;
  switch (cmd.type) {
    case "pause":
      world.setPaused(true);
      break;
    case "resume":
      world.setPaused(false);
      break;
    case "join": {
      const conv = world.join({ conversationId: cmd.conversationId, agentId: cmd.agentId });
      if (!conv) world.setToast("Could not join");
      break;
    }
    case "closeChat":
      world.closeChat();
      break;
    case "send": {
      const conv = world.appendUserLine(cmd.text);
      if (!conv) {
        world.setToast("No active chat");
        break;
      }
      mind.enqueueLive(conv.id, conv.generation, cmd.text);
      mainWindow?.webContents.send("office:stream", {
        type: "start",
        conversationId: conv.id,
        generation: conv.generation,
      });
      break;
    }
    case "setApiKey":
      keys.save(cmd.key);
      mind.refreshClient();
      world.setHasApiKey(true);
      world.setToast("API key saved");
      break;
    case "clearApiKey":
      keys.clear();
      mind.refreshClient();
      world.setHasApiKey(false);
      world.setToast("API key cleared");
      break;
    case "clickTile":
      world.clickTile(cmd.x, cmd.y);
      break;
    case "dismissToast":
      world.setToast(null);
      break;
    default: {
      const _exhaustive: never = cmd;
      void _exhaustive;
    }
  }
}

app.whenReady().then(async () => {
  await bootWorld();
  createWindow();

  ipcMain.handle("office:getSnapshot", () => world.snapshot());
  ipcMain.on("office:command", (_evt, raw) => {
    handleCommand(raw);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on("window-all-closed", () => {
  if (tickTimer) clearInterval(tickTimer);
  if (saveTimer) clearTimeout(saveTimer);
  if (dirty) {
    db.saveWorld({
      simMs: world.simMs,
      agents: world.agents,
      conversations: world.conversations,
      memories: world.memories,
      relationships: world.relationships,
      tokens: world.tokens,
    });
  }
  db.close();
  if (process.platform !== "darwin") app.quit();
});
