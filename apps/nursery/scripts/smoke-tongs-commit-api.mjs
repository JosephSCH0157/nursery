/* global process, console, fetch */

function env(name, fallback = undefined) {
  const raw = process.env[name];
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return trimmed || fallback;
}

const baseUrl = env("TONGS_SMOKE_BASE_URL", "http://127.0.0.1:5173");
const token = env("TONGS_API_TOKEN");
const workspaceId = env("TONGS_SMOKE_WORKSPACE_ID");

if (!workspaceId) {
  console.error("Missing TONGS_SMOKE_WORKSPACE_ID");
  process.exit(1);
}

if (!token) {
  console.warn("TONGS_API_TOKEN not set; request may fail if token guard is enabled");
}

function headers() {
  const out = {
    "content-type": "application/json",
  };
  if (token) out.authorization = `Bearer ${token}`;
  return out;
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  console.log(`POST ${path} -> ${response.status}`);
  console.log(JSON.stringify(parsed, null, 2));

  if (!response.ok) {
    throw new Error(`Request failed: ${path} status=${response.status}`);
  }

  return parsed;
}

async function main() {
  const cradle = await postJson("/tongs/cradles", {
    workspace_id: workspaceId,
    written_by: {
      tool: "nursery-smoke",
      tool_version: "0.0.0",
      lane: "forge-managed",
    },
  });

  const workpieceId = cradle?.data?.cradle?.id
    ?? cradle?.data?.episode?.id
    ?? cradle?.data?.workpiece?.id
    ?? cradle?.data?.id
    ?? cradle?.cradle?.id
    ?? cradle?.episode?.id
    ?? cradle?.workpiece?.id
    ?? cradle?.id;
  if (!workpieceId) {
    throw new Error("Create cradle response missing workpiece id");
  }

  await postJson(`/tongs/workpieces/${workpieceId}/commit-file`, {
    path: "script/script.md",
    content_type: "text/markdown; charset=utf-8",
    text: "# Smoke\n\nThis is a smoke commit.",
    written_by: {
      tool: "nursery-smoke",
      tool_version: "0.0.0",
      lane: "forge-managed",
    },
  });

  await postJson(`/tongs/workpieces/${workpieceId}/append-event`, {
    event_name: "smoke.completed",
    payload: { ok: true },
    written_by: {
      tool: "nursery-smoke",
      tool_version: "0.0.0",
      lane: "forge-managed",
    },
  });

  console.log("Smoke run complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
