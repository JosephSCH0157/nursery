import fetch, { Headers } from "node-fetch";

// ---- CONFIG ----
const TONGS_API_BASE = process.env.TONGS_API_BASE || "http://localhost:5173";
const WORKPIECE_ID = "900945cb-714b-419d-9646-1ba287807846";
const ARTIFACT_PATH =
  "hammer/revisions/84fc5a3d-3298-4f41-bf3e-8a8ac05a8d51/editor-session.v1.json";
const NEW_LABEL = "Florida Oranges";

const API_TOKEN = process.env.TONGS_API_TOKEN || "";
const USER_TOKEN = process.env.TONGS_USER_TOKEN || "";

async function main() {
  const headers = new Headers({
    accept: "application/json",
  });
  if (API_TOKEN) headers.set("authorization", `Bearer ${API_TOKEN}`);
  if (USER_TOKEN) {
    headers.set("x-forge-user-authorization", `Bearer ${USER_TOKEN}`);
  }

  const readUrl = `${TONGS_API_BASE}/tongs/workpieces/${encodeURIComponent(
    WORKPIECE_ID,
  )}/read-file?path=${encodeURIComponent(ARTIFACT_PATH)}`;

  console.log("[1] Fetching current editor-session artifact...");
  const readResp = await fetch(readUrl, { method: "GET", headers });
  if (!readResp.ok) {
    const err = await readResp.text();
    throw new Error(`Failed to read artifact: ${readResp.status} ${err}`);
  }

  const readJson = await readResp.json();
  const editorSession =
    readJson?.data && typeof readJson.data === "object"
      ? readJson.data
      : readJson;

  if (!editorSession || typeof editorSession !== "object") {
    throw new Error("Artifact JSON was not an object");
  }

  console.log("[2] Current media_source_label:", editorSession.media_source_label);

  editorSession.media_source_label = NEW_LABEL;
  console.log("[3] Patching media_source_label to:", NEW_LABEL);

  const commitUrl = `${TONGS_API_BASE}/tongs/workpieces/${encodeURIComponent(
    WORKPIECE_ID,
  )}/commit-file`;

  const commitHeaders: Record<string, string> = {
    "content-type": "application/json",
  };
  if (API_TOKEN) commitHeaders["authorization"] = `Bearer ${API_TOKEN}`;
  if (USER_TOKEN) {
    commitHeaders["x-forge-user-authorization"] = `Bearer ${USER_TOKEN}`;
  }

  const commitBody = {
    path: ARTIFACT_PATH,
    content_type: "application/json",
    written_by: "manual-repair-script",
    json: editorSession,
  };

  console.log("[4] Writing updated artifact...");
  const commitResp = await fetch(commitUrl, {
    method: "POST",
    headers: commitHeaders,
    body: JSON.stringify(commitBody),
  });

  if (!commitResp.ok) {
    const err = await commitResp.text();
    throw new Error(`Failed to commit artifact: ${commitResp.status} ${err}`);
  }

  console.log("[5] Patch committed successfully.");

  const confirmResp = await fetch(readUrl, { method: "GET", headers });
  if (!confirmResp.ok) {
    const err = await confirmResp.text();
    throw new Error(`Failed to confirm artifact: ${confirmResp.status} ${err}`);
  }

  const confirmJson = await confirmResp.json();
  const confirmSession =
    confirmJson?.data && typeof confirmJson.data === "object"
      ? confirmJson.data
      : confirmJson;

  console.log("[6] Confirmed media_source_label:", confirmSession.media_source_label);

  if (confirmSession.media_source_label === NEW_LABEL) {
    console.log("✅ Patch verified. Done.");
  } else {
    console.warn("⚠️ Patch did not take effect as expected.");
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
