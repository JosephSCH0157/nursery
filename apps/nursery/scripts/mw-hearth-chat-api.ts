import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Next = (err?: unknown) => void;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type Behavior = "fast" | "careful" | "deterministic" | "creative";
type ReqBody = {
  messages?: unknown;
  behavior?: unknown;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_ROOT = path.join(__dirname, "..");
const ENV_FILES = [".env.local", ".env"];
const CHAT_ROUTE = "/api/hearth/chat";

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

for (const filename of ENV_FILES) {
  loadEnvFile(path.join(ENV_ROOT, filename));
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return {};
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isBehavior(value: unknown): value is Behavior {
  return value === "fast" || value === "careful" || value === "deterministic" || value === "creative";
}

function isRole(value: unknown): value is ChatRole {
  return value === "system" || value === "user" || value === "assistant";
}

function toChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isRole(row.role)) return null;
  if (typeof row.content !== "string") return null;
  const content = row.content.trim();
  if (!content) return null;
  return {
    role: row.role,
    content,
  };
}

function behaviorToTemperature(behavior: Behavior): number {
  switch (behavior) {
    case "fast":
      return 0.8;
    case "creative":
      return 0.95;
    case "deterministic":
      return 0.1;
    case "careful":
    default:
      return 0.5;
  }
}

function extractAssistantReply(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  const choices = row.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const piece = item as Record<string, unknown>;
    const text = piece.text;
    if (typeof text === "string" && text.trim()) {
      parts.push(text.trim());
    }
  }
  return parts.join("\n").trim();
}

export function mwHearthChatApi() {
  const apiKey = readEnv("OPENAI_API_KEY");
  const model = readEnv("HEARTH_AI_MODEL") || "gpt-5";

  return async function hearthChatMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    try {
      const rawUrl = req.url || "";
      const isTarget =
        rawUrl === CHAT_ROUTE || rawUrl.startsWith(`${CHAT_ROUTE}?`) || rawUrl.startsWith(`${CHAT_ROUTE}/`);
      if (!isTarget) {
        next();
        return;
      }

      const method = (req.method || "GET").toUpperCase();
      if (method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }
      if (!apiKey) {
        sendJson(res, 500, { ok: false, error: "Missing OPENAI_API_KEY in server env" });
        return;
      }

      const bodyRaw = (await readJsonBody(req)) as ReqBody;
      const behavior = isBehavior(bodyRaw.behavior) ? bodyRaw.behavior : "careful";
      const rawMessages = Array.isArray(bodyRaw.messages) ? bodyRaw.messages : [];
      const messages = rawMessages
        .map(toChatMessage)
        .filter((item): item is ChatMessage => Boolean(item))
        .slice(-24);

      if (!messages.length) {
        sendJson(res, 400, { ok: false, error: "messages are required" });
        return;
      }

      const system: ChatMessage = {
        role: "system",
        content: "You are Hearth. Reply plainly. No markdown.",
      };

      const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [system, ...messages],
          temperature: behaviorToTemperature(behavior),
        }),
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        sendJson(res, 502, { ok: false, error: "OpenAI error", detail });
        return;
      }

      const payload = (await upstream.json()) as unknown;
      const reply = extractAssistantReply(payload);
      if (!reply) {
        sendJson(res, 502, { ok: false, error: "OpenAI returned empty response" });
        return;
      }

      sendJson(res, 200, { ok: true, reply });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(res, 500, { ok: false, error: message });
    }
  };
}
