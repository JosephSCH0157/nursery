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
type HearthOp =
  | { op: "set_title_variant"; slot: "A" | "B" | "C"; value: string }
  | { op: "set_title"; value: string }
  | { op: "set_outline"; value: string }
  | { op: "set_body"; value: string }
  | { op: "add_source"; source: { title?: string; url?: string; note?: string } }
  | { op: "update_source"; id: string; patch: { title?: string; url?: string; note?: string } }
  | { op: "remove_source"; id: string };

type EpisodeContext = {
  episodeId: string;
  title: string;
  titleVariants: { A: string; B: string; C: string };
  outline: string;
  body: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    note: string;
    citedIn: string[];
  }>;
  sparks: Array<{ id: string; text: string }>;
};

type StructuredReply = {
  assistantText: string;
  ops: HearthOp[];
  scriptText: string | null;
  tagAudit: Record<string, unknown> | null;
};

type ReqBody = {
  messages?: unknown;
  episode_context?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function canonicalizeToken(raw: string): string {
  const inner = raw.slice(1, -1).trim().toLowerCase().replace(/\s+/g, " ");
  return `[${inner}]`;
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

function readBehaviorTemperature(value: unknown): number {
  const behavior = readOptionalString(value);
  if (behavior === "deterministic") return 0.1;
  if (behavior === "careful") return 0.25;
  if (behavior === "creative") return 0.9;
  if (behavior === "fast") return 0.7;
  return 0.25;
}

function normalizeEpisodeContext(value: unknown): EpisodeContext | null {
  if (!isRecord(value)) return null;
  const episodeId = readOptionalString(value.episodeId);
  if (!episodeId) return null;

  const titleVariantsRaw = isRecord(value.titleVariants) ? value.titleVariants : {};
  const titleVariants = {
    A: readOptionalString(titleVariantsRaw.A) ?? "",
    B: readOptionalString(titleVariantsRaw.B) ?? "",
    C: readOptionalString(titleVariantsRaw.C) ?? "",
  };

  const sourcesRaw = Array.isArray(value.sources) ? value.sources : [];
  const sources = sourcesRaw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readOptionalString(entry.id);
      if (!id) return null;
      const citedInRaw = Array.isArray(entry.citedIn) ? entry.citedIn : [];
      const citedIn = citedInRaw
        .map((token) => readOptionalString(token))
        .filter((token): token is string => !!token);
      return {
        id,
        title: readOptionalString(entry.title) ?? "",
        url: readOptionalString(entry.url) ?? "",
        note: readOptionalString(entry.note) ?? "",
        citedIn,
      };
    })
    .filter((entry): entry is EpisodeContext["sources"][number] => !!entry);

  const sparksRaw = Array.isArray(value.sparks) ? value.sparks : [];
  const sparks = sparksRaw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readOptionalString(entry.id);
      if (!id) return null;
      return {
        id,
        text: readOptionalString(entry.text) ?? "",
      };
    })
    .filter((entry): entry is EpisodeContext["sparks"][number] => !!entry);

  return {
    episodeId,
    title: readOptionalString(value.title) ?? "",
    titleVariants,
    outline: readOptionalString(value.outline) ?? "",
    body: readOptionalString(value.body) ?? "",
    sources,
    sparks,
  };
}

function buildSystemPrompt(context: EpisodeContext): string {
  return [
    "You are Hearth.",
    "You are already operating inside an Episode context.",
    "Never ask what the topic is.",
    "Use only the provided episode_context as your factual context unless the user explicitly gives new details.",
    "Return ONLY valid JSON with this shape:",
    "{\"assistantText\": string, \"ops\": HearthOp[], \"script_text\": string|null, \"tag_audit\": object|null}",
    "Allowed ops:",
    "- set_title",
    "- set_title_variant",
    "- set_outline",
    "- set_body",
    "- add_source",
    "- update_source",
    "- remove_source",
    "Tag Contract (hard rules):",
    "- Allowed speaker blocks only: [s1]...[/s1], [s2]...[/s2], [g1]...[/g1], [g2]...[/g2]",
    "- Speaker tags must be on their own line with nothing else on that line.",
    "- No overlaps, no missing closes, no cross-tagging.",
    "- Allowed inline pacing tokens: [pause], [beat], [reflective pause]",
    "- Allowed hidden notes: [note]...[/note], and [note] tags must be on their own lines.",
    "- Forbid random markup: Joe:, Brad:, **Brad:**, <speaker>, Markdown headings.",
    "- Canonical speaker mapping: S1 = Joe, S2 = Brad.",
    "Rules:",
    "- assistantText must be concise plain text (no markdown).",
    "- Use ops only for concrete edits requested by the user.",
    "- If the user only asks a question, return ops as [].",
    "- Do not invent source ids for update/remove ops.",
    "- When proposing or returning a script body, include script_text and tag_audit.",
    "- tag_audit must briefly confirm closure, standalone tags, and no markdown/random markup.",
    "- Keep output strictly JSON (no code fences).",
    "episode_context:",
    JSON.stringify(context),
  ].join("\n");
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

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    // continue
  }

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) {
    try {
      const parsed = JSON.parse(fenced[1]) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      // continue
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeOpPatch(value: unknown): { title?: string; url?: string; note?: string } | null {
  if (!isRecord(value)) return null;
  const title = readOptionalString(value.title) ?? undefined;
  const url = readOptionalString(value.url) ?? undefined;
  const note = readOptionalString(value.note) ?? undefined;
  if (!title && !url && !note) return null;
  return {
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(note ? { note } : {}),
  };
}

function normalizeOps(value: unknown): HearthOp[] {
  if (!Array.isArray(value)) return [];
  const out: HearthOp[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const op = readOptionalString(item.op);
    if (!op) continue;

    if (op === "set_title") {
      const next = readOptionalString(item.value);
      if (next != null) out.push({ op, value: next });
      continue;
    }

    if (op === "set_title_variant") {
      const slot = readOptionalString(item.slot);
      const valueText = readOptionalString(item.value);
      if ((slot === "A" || slot === "B" || slot === "C") && valueText != null) {
        out.push({ op, slot, value: valueText });
      }
      continue;
    }

    if (op === "set_outline") {
      const next = readOptionalString(item.value);
      if (next != null) out.push({ op, value: next });
      continue;
    }

    if (op === "set_body") {
      const next = readOptionalString(item.value);
      if (next != null) out.push({ op, value: next });
      continue;
    }

    if (op === "add_source") {
      const source = normalizeOpPatch(item.source);
      if (source) out.push({ op, source });
      continue;
    }

    if (op === "update_source") {
      const id = readOptionalString(item.id);
      const patch = normalizeOpPatch(item.patch);
      if (id && patch) out.push({ op, id, patch });
      continue;
    }

    if (op === "remove_source") {
      const id = readOptionalString(item.id);
      if (id) out.push({ op, id });
      continue;
    }
  }

  return out;
}

function buildTagAuditFromScript(scriptText: string | null): Record<string, unknown> | null {
  const script = scriptText?.trim();
  if (!script) return null;

  const tagMatches = script.match(/\[[^\]]+\]/g) ?? [];
  const normalizedTags = tagMatches.map((tag) => canonicalizeToken(tag));
  const allowedTags = new Set<string>([
    "[s1]", "[/s1]",
    "[s2]", "[/s2]",
    "[g1]", "[/g1]",
    "[g2]", "[/g2]",
    "[note]", "[/note]",
    "[pause]", "[beat]", "[reflective pause]",
  ]);
  const noUnknownTags = normalizedTags.every((tag) => allowedTags.has(tag));

  const speakerStandalone = !/\[(?:s1|s2|g1|g2)\]\s*\S/i.test(script) && !/\S\s*\[\/(?:s1|s2|g1|g2)\]/i.test(script);
  const noteStandalone = !/\[note\]\s*\S/i.test(script) && !/\S\s*\[\/note\]/i.test(script);
  const noForbiddenMarkup = (
    !/(^|\n)\s*#{1,6}\s+\S/.test(script)
    && !/(^|\n)\s*\*\*[^*\n]{1,80}:\*\*/i.test(script)
    && !/(^|\n)\s*(?:joe|brad|s1|s2|g1|g2)\s*:/i.test(script)
    && !/(^|\n)\s*\((?:joe|brad|s1|s2|g1|g2)\s*:\)/i.test(script)
    && !/<\s*\/?\s*[a-z][^>]*>/i.test(script)
  );

  const blockRe = /\[(\/?)(s1|s2|g1|g2|note)\]/gi;
  const stack: string[] = [];
  let noCrossTagging = true;
  let match: RegExpExecArray | null = null;
  while ((match = blockRe.exec(script)) !== null) {
    const close = Boolean(match[1]);
    const name = match[2].toLowerCase();
    if (!close) {
      stack.push(name);
      continue;
    }
    const top = stack.pop();
    if (top !== name) {
      noCrossTagging = false;
      break;
    }
  }

  return {
    speaker_blocks_closed: stack.length === 0 && noCrossTagging,
    speaker_tags_standalone_lines: speakerStandalone,
    note_blocks_standalone_lines: noteStandalone,
    no_cross_tagging: noCrossTagging,
    no_unknown_tags: noUnknownTags,
    no_forbidden_markup: noForbiddenMarkup,
  };
}

function normalizeStructuredReply(raw: string): StructuredReply | null {
  const parsed = tryParseJsonObject(raw);
  if (!parsed) return null;
  const assistantText = readOptionalString(parsed.assistantText) ?? readOptionalString(parsed.assistant_text) ?? "";
  const ops = normalizeOps(parsed.ops);
  const scriptText = readOptionalString(parsed.script_text) ?? null;
  if (!assistantText && ops.length === 0) return null;
  const inferredScriptText = scriptText
    ?? (ops.find((op) => op.op === "set_body") as { op: "set_body"; value: string } | undefined)?.value
    ?? null;
  const tagAudit = isRecord(parsed.tag_audit)
    ? parsed.tag_audit
    : buildTagAuditFromScript(inferredScriptText);
  return {
    assistantText,
    ops,
    scriptText: inferredScriptText,
    tagAudit,
  };
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

      const episodeContext = normalizeEpisodeContext(bodyRaw.episode_context);
      if (!episodeContext) {
        sendJson(res, 400, {
          ok: false,
          error: "episode_context with episodeId is required",
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      const system: ChatMessage = {
        role: "system",
        content: buildSystemPrompt(episodeContext),
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
              temperature: readBehaviorTemperature(bodyRaw.behavior),
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
        const rawReply = extractAssistantReply(payload);
        if (!rawReply) {
          sendJson(res, 502, {
            ok: false,
            error: "OpenAI returned empty response",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        const structured = normalizeStructuredReply(rawReply) ?? {
          assistantText: rawReply,
          ops: [],
          scriptText: null,
          tagAudit: null,
        };

        if (!structured.assistantText && structured.ops.length === 0) {
          sendJson(res, 502, {
            ok: false,
            error: "Assistant returned an invalid response",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        if (clientAborted || req.aborted) {
          return;
        }

        const totalTokens = extractTotalTokens(payload);
        const spent = totalTokens ?? estimateTokenFallback(messages, rawReply);
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
          assistant_text: structured.assistantText,
          reply: structured.assistantText,
          ops: structured.ops,
          script_text: structured.scriptText,
          tag_audit: structured.tagAudit,
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
