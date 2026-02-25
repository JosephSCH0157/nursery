import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";

type Next = (err?: unknown) => void;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type BillingMode = "forge" | "byo";
type ReqBody = {
  messages?: unknown;
  behavior?: unknown;
  lane?: unknown;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_ROOT = path.join(__dirname, "..");
const ENV_FILES = [".env.local", ".env"];
const CHAT_ROUTE = "/api/hearth/chat";
const CHAT_STATUS_ROUTE = "/api/hearth/chat/status";

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

function readIntegerEnv(name: string): number | null {
  const raw = readEnv(name);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 0 ? parsed : null;
}

function readBearerToken(headerValue: string | string[] | undefined): string | null {
  if (!headerValue) return null;
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
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

function extractRpcTokenBalance(payload: unknown): number | null {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== "object") return null;
  const tokenBalance = (row as Record<string, unknown>).token_balance;
  return typeof tokenBalance === "number" && Number.isFinite(tokenBalance) && tokenBalance >= 0
    ? tokenBalance
    : null;
}

function isRole(value: unknown): value is ChatRole {
  return value === "system" || value === "user" || value === "assistant";
}

function isBillingMode(value: unknown): value is BillingMode {
  return value === "forge" || value === "byo";
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

function extractTotalTokens(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const total = (usage as Record<string, unknown>).total_tokens;
  return typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : null;
}

function estimateTokenFallback(messages: ChatMessage[], reply: string): number {
  const messageChars = messages.reduce((acc, message) => acc + message.content.length, 0);
  const totalChars = messageChars + reply.length;
  return Math.max(1, Math.ceil(totalChars / 4));
}

export function mwHearthChatApi() {
  const apiKey = readEnv("OPENAI_API_KEY");
  const model = readEnv("HEARTH_AI_MODEL") || "gpt-5";
  const configuredBillingMode: BillingMode = readEnv("HEARTH_AI_BILLING_MODE") === "byo" ? "byo" : "forge";
  let tokenBalance = readIntegerEnv("HEARTH_AI_TOKEN_BALANCE") ?? 12430;
  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseService: SupabaseClient<Database> | null =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : null;

  function buildBillingSnapshot(mode: BillingMode) {
    return {
      billing_mode: mode,
      token_balance: mode === "forge" ? tokenBalance : null,
    };
  }

  async function resolveUserId(accessToken: string | null): Promise<string | null> {
    if (!accessToken || !supabaseService) return null;
    const { data, error } = await supabaseService.auth.getUser(accessToken);
    if (error) {
      console.warn("[hearth-chat-api] failed to resolve user from bearer token", error.message);
      return null;
    }
    return data.user?.id ?? null;
  }

  async function applyTokenDelta(args: {
    userId: string;
    spent: number;
    requestId: string;
    openAiRequestId: string | null;
  }): Promise<{ ok: true; tokenBalance: number | null } | { ok: false; warning: string }> {
    if (!supabaseService) {
      console.warn("[hearth-chat-api] apply_ai_token_delta skipped: supabase service env missing");
      return { ok: false, warning: "Unable to update credits." };
    }

    const rpcClient = supabaseService.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        params: {
          p_user_id: string;
          p_delta: number;
          p_reason: string;
          p_request_id: string;
          p_provider_request_id?: string;
        },
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data, error } = await rpcClient.rpc("apply_ai_token_delta", {
      p_user_id: args.userId,
      p_delta: -args.spent,
      p_reason: "hearth:chat",
      p_request_id: args.requestId,
      p_provider_request_id: args.openAiRequestId ?? undefined,
    });

    if (error) {
      console.warn("[hearth-chat-api] apply_ai_token_delta failed", {
        message: error.message,
        request_id: args.requestId,
        openai_request_id: args.openAiRequestId,
      });
      return { ok: false, warning: "Unable to update credits." };
    }

    return {
      ok: true,
      tokenBalance: extractRpcTokenBalance(data),
    };
  }

  return async function hearthChatMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    try {
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const url = new URL(rawUrl, origin);
      const pathname = url.pathname;

      if (pathname !== CHAT_ROUTE && pathname !== CHAT_STATUS_ROUTE) {
        next();
        return;
      }

      const method = (req.method || "GET").toUpperCase();

      if (pathname === CHAT_STATUS_ROUTE) {
        if (method !== "GET") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const laneParam = url.searchParams.get("lane");
        const lane: BillingMode = isBillingMode(laneParam) ? laneParam : configuredBillingMode;
        sendJson(res, 200, {
          ok: true,
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      if (method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      const bodyRaw = (await readJsonBody(req)) as ReqBody;
      const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
      const bearerToken = readBearerToken(req.headers.authorization);

      if (!apiKey) {
        sendJson(res, 500, {
          ok: false,
          error: "Missing OPENAI_API_KEY in server env",
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      if (lane === "forge" && tokenBalance != null && tokenBalance <= 0) {
        sendJson(res, 402, {
          ok: false,
          error: "No AI credits remaining.",
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      const rawMessages = Array.isArray(bodyRaw.messages) ? bodyRaw.messages : [];
      const messages = rawMessages
        .map(toChatMessage)
        .filter((item): item is ChatMessage => Boolean(item))
        .slice(-24);

      if (!messages.length) {
        sendJson(res, 400, {
          ok: false,
          error: "messages are required",
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      const system: ChatMessage = {
        role: "system",
        content: "You are Hearth. Reply plainly. No markdown.",
      };

      const upstreamAbort = new AbortController();
      let clientAborted = req.aborted === true;
      const onAborted = () => {
        clientAborted = true;
        upstreamAbort.abort();
      };
      req.once("aborted", onAborted);

      try {
        let upstream: Response;
        try {
          upstream = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [system, ...messages],
            }),
            signal: upstreamAbort.signal,
          });
        } catch (error) {
          if (clientAborted || upstreamAbort.signal.aborted) {
            return;
          }
          throw error;
        }

        if (clientAborted) {
          return;
        }

        if (!upstream.ok) {
          const detail = await upstream.text();
          sendJson(res, 502, {
            ok: false,
            error: "OpenAI error",
            detail,
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        const payload = (await upstream.json()) as unknown;
        const reply = extractAssistantReply(payload);
        if (!reply) {
          sendJson(res, 502, {
            ok: false,
            error: "OpenAI returned empty response",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        if (clientAborted || req.aborted) {
          return;
        }

        const totalTokens = extractTotalTokens(payload);
        const spent = totalTokens ?? estimateTokenFallback(messages, reply);
        const openAiRequestId = upstream.headers.get("x-request-id");
        let creditsWarning: string | null = null;

        if (lane === "forge" && spent > 0) {
          const userId = await resolveUserId(bearerToken);
          if (!userId) {
            creditsWarning = "Unable to update credits.";
          } else {
            const deltaResult = await applyTokenDelta({
              userId,
              spent,
              requestId: crypto.randomUUID(),
              openAiRequestId,
            });
            if (!deltaResult.ok) {
              creditsWarning = deltaResult.warning;
            } else if (deltaResult.tokenBalance != null) {
              tokenBalance = deltaResult.tokenBalance;
            }
          }
        }

        if (clientAborted || req.aborted) {
          return;
        }

        sendJson(res, 200, {
          ok: true,
          reply,
          total_tokens: spent,
          credits_warning: creditsWarning,
          ...buildBillingSnapshot(lane),
        });
      } finally {
        req.removeListener("aborted", onAborted);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(res, 500, { ok: false, error: message });
    }
  };
}
