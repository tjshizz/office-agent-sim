import { AmbientScriptSchema, MODELS, type AmbientScript } from "@office-sim/shared";

const BASE = "https://api.x.ai/v1";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
};

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type StreamHandlers = {
  onToken?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onDone?: (full: string, usage?: { total_tokens?: number }) => void;
  onError?: (err: Error) => void;
};

async function parseJsonSafe(text: string): Promise<unknown> {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1]!.trim() : trimmed;
  return JSON.parse(raw);
}

export class GrokClient {
  private readonly baseUrl: string;

  constructor(private apiKey: string, baseUrl = BASE) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async completeJson(system: string, user: string, model = MODELS.ambient): Promise<{
    script: AmbientScript | null;
    usageTokens: number;
    error?: string;
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { script: null, usageTokens: 0, error: `Grok ${res.status}: ${body.slice(0, 200)}` };
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { total_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const usageTokens = data.usage?.total_tokens ?? 500;
      try {
        const parsed = AmbientScriptSchema.parse(await parseJsonSafe(content));
        return { script: parsed, usageTokens };
      } catch {
        // one repair retry
        const repair = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
              { role: "assistant", content },
              {
                role: "user",
                content:
                  "Your previous reply was invalid. Reply with ONLY valid JSON matching the schema: { lines: [{speakerId,text}], intentions: [{agentId,kind,locationId?}] }",
              },
            ],
          }),
        });
        if (!repair.ok) {
          return { script: null, usageTokens, error: "Invalid ambient JSON" };
        }
        const repairData = (await repair.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { total_tokens?: number };
        };
        const repaired = repairData.choices?.[0]?.message?.content ?? "";
        const usage2 = usageTokens + (repairData.usage?.total_tokens ?? 200);
        try {
          const parsed = AmbientScriptSchema.parse(await parseJsonSafe(repaired));
          return { script: parsed, usageTokens: usage2 };
        } catch {
          return { script: null, usageTokens: usage2, error: "Invalid ambient JSON after retry" };
        }
      }
    } catch (e) {
      return { script: null, usageTokens: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async streamChat(
    messages: ChatMessage[],
    tools: ToolDef[],
    handlers: StreamHandlers,
    model = MODELS.live,
    temperature = 0.7,
  ): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature,
          stream: true,
          messages,
          tools: tools.length ? tools : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.text();
        handlers.onError?.(new Error(`Grok ${res.status}: ${body.slice(0, 200)}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buffer = "";
      let usage: { total_tokens?: number } | undefined;
      const toolBuf: Record<number, { name: string; args: string }> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: {
                delta?: {
                  content?: string;
                  tool_calls?: { index: number; function?: { name?: string; arguments?: string } }[];
                };
              }[];
              usage?: { total_tokens?: number };
            };
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) {
              full += delta.content;
              handlers.onToken?.(delta.content);
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const slot = (toolBuf[tc.index] ??= { name: "", args: "" });
                if (tc.function?.name) slot.name += tc.function.name;
                if (tc.function?.arguments) slot.args += tc.function.arguments;
              }
            }
            if (json.usage) usage = json.usage;
          } catch {
            // ignore partial SSE
          }
        }
      }

      for (const tc of Object.values(toolBuf)) {
        if (!tc.name) continue;
        try {
          handlers.onToolCall?.(tc.name, JSON.parse(tc.args || "{}") as Record<string, unknown>);
        } catch {
          handlers.onToolCall?.(tc.name, {});
        }
      }
      handlers.onDone?.(full, usage);

    } catch (e) {
      handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export const LIVE_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Remember a short fact about the user or another employee.",
      parameters: {
        type: "object",
        properties: {
          about: { type: "string", description: "user or employee id" },
          text: { type: "string", description: "fact to remember" },
        },
        required: ["about", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_task",
      description: "Assign an office task to an employee.",
      parameters: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          kind: {
            type: "string",
            enum: ["go_work", "get_coffee", "wander", "attend_meeting", "wait"],
          },
          locationId: { type: "string" },
        },
        required: ["agentId", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_conversation",
      description: "Politely end the current conversation.",
      parameters: { type: "object", properties: {} },
    },
  },
];
