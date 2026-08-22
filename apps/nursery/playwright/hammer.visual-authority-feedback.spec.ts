import { expect, test } from "playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, "../../..");
const viteFsUrl = (relativePath: string) => `/@fs/${path.resolve(repositoryRoot, relativePath).replaceAll("\\", "/")}`;
const moduleUrls = {
  shell: viteFsUrl("apps/hammer/src/editor/HammerWorkspaceShell.tsx"),
  visualTimelineDock: viteFsUrl("apps/hammer/src/visuals/components/VisualTimelineDock.tsx"),
  presets: viteFsUrl("apps/hammer/src/dev/hammerLaunchPresets.ts"),
  defaults: viteFsUrl("apps/hammer/src/visuals/model/hammerVisualDefaults.ts"),
  authority: viteFsUrl("apps/hammer/src/persistence/hammerVisualAuthority.ts"),
};

test("visual clips beyond playback duration retain distinct native pointer targets", async ({ page }) => {
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (["127.0.0.1", "::1", "localhost"].includes(host)) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
  await page.goto("/");
  await page.evaluate(async (urls) => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { default: VisualTimelineDock } = await import(urls.visualTimelineDock);
    const selected: string[] = [];
    (window as any).__hammerTimelineHitTestSelections = selected;
    document.body.innerHTML = `
      <style>
        .hammer-visual-timeline-lane__track { position: relative; width: 400px; height: 44px; overflow: hidden; }
        .hammer-visual-clip-block { position: absolute; top: 6px; height: 32px; box-sizing: border-box; }
      </style>
      <div id="hammer-visual-hit-test-root"></div>
    `;
    createRoot(document.getElementById("hammer-visual-hit-test-root")!).render(
      React.createElement(VisualTimelineDock, {
        clips: [
          { clipId: "placement-target", label: "Entire seasons lost.", startSec: 386.5, endSec: 389.2, selected: false },
          { clipId: "placement-later", label: "Later placement", startSec: 416.6, endSec: 419.3, selected: false },
        ],
        playheadSec: 0,
        durationSec: 30,
        selectedClipId: null,
        editable: true,
        onSelectClip: (clipId: string) => selected.push(clipId),
      }),
    );
  }, moduleUrls);

  const target = page.locator('[data-clip-id="placement-target"]');
  const later = page.locator('[data-clip-id="placement-later"]');
  await expect(target).toBeVisible();
  await expect(later).toBeVisible();
  const targetBox = await target.boundingBox();
  const laterBox = await later.boundingBox();
  expect(targetBox).not.toBeNull();
  expect(laterBox).not.toBeNull();
  expect((targetBox?.x ?? 0) + (targetBox?.width ?? 0)).toBeLessThan(laterBox?.x ?? 0);

  await target.click();
  await expect.poll(() => page.evaluate(() => (window as any).__hammerTimelineHitTestSelections)).toEqual(["placement-target"]);
});

test.beforeEach(async ({ baseURL }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  expect(["127.0.0.1", "::1", "localhost"]).toContain(host);
});

test("mounted Hammer shell does not re-emit a stale workpiece visual downgrade", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (urls) => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { default: HammerWorkspaceShell } = await import(urls.shell);
    const { getHammerDevLaunchPreset } = await import(urls.presets);
    const { createDefaultSemanticAnchor, createDefaultVisualAnimation, createDefaultVisualGeometry } = await import(urls.defaults);
    const { persistHammerCanonicalSave } = await import(urls.authority);
    const updatedAt = "2026-08-15T19:04:47.000Z";
    const assets = Array.from({ length: 30 }, (_, index) => ({
      asset_id: `asset-${index}`, asset_ref: `asset-${index}`, kind: index % 2 ? "image" : "broll", label: `Asset ${index}`,
      path: `visuals/${index}.png`, storage_key: null, mime_type: "image/png", source_mode: "manual", roles: ["timeline_visual"], updated_at: updatedAt,
    }));
    const clips = assets.map((asset, index) => ({
      clip_id: `clip-${index}`, asset_id: asset.asset_id, lane_id: "lane:primary", entry_id: `entry-${index}`, label: `Clip ${index}`,
      visual_mode: asset.kind, confidence: 1, placement_status: "placed", ingest_state: index < 29 ? "approved" : "suggested",
      uncertainty_flags: [], start_sec: index, end_sec: index + 0.75, geometry: createDefaultVisualGeometry(), fit_mode: "contain",
      animation: createDefaultVisualAnimation(), opacity: 1, z_index: index, enabled: true, locked: false, source_mode: "manual",
      anchor_hint: { anchor_segment_id: null, matched_segment_ids: [], anchor_text: null, anchor_label: null, detached: false },
      semantic_anchor: createDefaultSemanticAnchor(), divergence: { state: "not_comparable", start_delta_sec: null, end_delta_sec: null }, updated_at: updatedAt,
    }));
    const canonicalTimeline = { version: 2, revision: 7, updated_at: updatedAt, source_mode: "packaging", selected_clip_id: "clip-0", assets, clips, lanes: [{ lane_id: "lane:primary", label: "Visuals", clip_ids: clips.map((clip) => clip.clip_id) }], debug_origin: "canonical_load" };
    const canonicalAuthority = { schema_version: 1, graph_id: "workpiece:plan:authority", graph_version: 1, workspace_id: "workspace", workpiece_id: "workpiece", session_id: "session", source_transcript_id: null, operation_order: [], operations: [], created_at: updatedAt, updated_at: updatedAt };
    const artifact = (data: unknown, path: string | null = null) => ({ path, updated_at: updatedAt, data });
    const canonicalSnapshot: any = {
      schema_version: 1,
      state: { workspace_id: "workspace", workpiece_id: "workpiece", active_session_id: "session", current_pass: "visual_assembly", pass_order_version: 1, pass_status: {}, editor_session_path: null, transcript_artifact_path: null, transcript_versions_artifact_path: null, speaker_map_artifact_path: null, visual_placement_artifact_path: "canonical-placements", visual_timeline_artifact_path: "canonical-timeline", audio_polish_artifact_path: null, edit_plan_artifact_path: null, editorial_authority_artifact_path: null, edit_plan_signature: null, prep_status: "prepared", alignment_status: "aligned", macro_recipe_ref: null, last_macro_run_ref: null, last_opened_at: updatedAt, updated_at: updatedAt, updated_by: "revision" },
      editor_session: artifact(null), structured_transcript: artifact(null), transcript_version_registry: artifact(null), speaker_map: artifact(null),
      visual_placements: artifact({ schema_version: 1, status: "prepared", source_refs: [], uncertainty_flags: [], placements: clips.map((clip) => ({ placement_id: clip.clip_id, entry_id: clip.entry_id, anchor_segment_id: "segment-0", matched_segment_ids: ["segment-0"], anchor_text: null, asset_ref: clip.asset_id, asset_id: clip.asset_id, asset_path: `visuals/${clip.clip_id}.png`, storage_key: null, label: clip.label, visual_mode: clip.visual_mode, start_sec: clip.start_sec, end_sec: clip.end_sec, confidence: clip.confidence, timing_source: "ordered_fallback", status: clip.placement_status, ingest_state: clip.ingest_state, uncertainty_flags: [] })) }, "canonical-placements"),
      visual_timeline: artifact(canonicalTimeline, "canonical-timeline"), audio_polish: artifact(null), edit_plan: artifact(null), editorial_authority: artifact(canonicalAuthority, "canonical-authority"), macro_hooks: { recipe_ref: null, last_run_ref: null },
    };
    const stale = structuredClone(canonicalSnapshot);
    stale.visual_timeline.data = null;
    stale.visual_placements.data.placements = stale.visual_placements.data.placements.slice(0, 18);
    stale.state.visual_timeline_artifact_path = null;
    stale.state.visual_placement_artifact_path = "legacy-placements";
    const metrics = { emissions: 0, emissionsAtReconcile: 0, revisionWrites: 0, workpieceWrites: 0, clips: 0, assets: 0, approvals: 0, timelinePath: "", identity: "", initialIdentity: `${canonicalTimeline.revision}:${canonicalTimeline.updated_at}`, identityPreserved: false, timerPending: false, completed: false };
    (window as any).__hammerAuthorityMetrics = metrics;
    const revision = { id: "revision", workspace_id: "workspace", workpiece_id: "workpiece", canonical_recording_id: "recording", status: "active", label: null, editor_session_path: null, revision_transcript_path: null, audio_polish_path: null, visual_timeline_path: "canonical-timeline", visual_placements_path: "canonical-placements", history_path: null, snapshots_manifest_path: null };
    const lanes = { canonical_hydration: 0, revision_mutation: 0, workpiece_reconciliation: 0, lifecycle_flush: 0 };
    function Harness() {
      const [timeline, setTimeline] = React.useState(canonicalTimeline);
      const saved = React.useRef(false);
      const saveTimer = React.useRef(0);
      const onWorkspaceSnapshotChange = React.useCallback((snapshot: any) => {
        metrics.emissions += 1;
        metrics.clips = snapshot.visualTimeline.clips.length;
        metrics.assets = snapshot.visualTimeline.assets.length;
        metrics.approvals = snapshot.visualTimeline.clips.filter((clip: any) => clip.ingest_state === "approved").length;
        metrics.identity = `${snapshot.visualTimeline.revision}:${snapshot.visualTimeline.updated_at}`;
        if (saved.current) return;
        window.clearTimeout(saveTimer.current);
        metrics.timerPending = true;
        saveTimer.current = window.setTimeout(async () => {
          saved.current = true;
          const result = await persistHammerCanonicalSave({
            target: { workspaceId: "workspace", workpieceId: "workpiece" }, revisionId: "revision",
            revisionRequest: { visual_timeline: { data: canonicalTimeline }, visual_placements: { data: canonicalSnapshot.visual_placements.data } },
            persistenceRequest: { editorial_authority: { data: canonicalAuthority }, written_by: { tool: "hammer", tool_version: "test", lane: "test" } }, canonicalSnapshot,
            identity: { workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 1 },
            currentIdentity: () => ({ workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 1 }), laneSequences: lanes,
            adapters: {
              saveRevision: async () => { metrics.revisionWrites += 1; return { ok: true, status: 200, data: { revision } }; },
              saveWorkpiece: async () => { metrics.workpieceWrites += 1; return { ok: true, status: 200, data: stale }; },
            },
          });
          if (result.ok) {
            metrics.emissionsAtReconcile = metrics.emissions;
            metrics.timelinePath = result.snapshot.state.visual_timeline_artifact_path;
            metrics.identityPreserved = result.snapshot.visual_timeline.data === canonicalTimeline;
            setTimeline(result.snapshot.visual_timeline.data);
            metrics.timerPending = false;
            metrics.completed = true;
          }
        }, 200);
      }, []);
      return React.createElement(HammerWorkspaceShell, { launchContext: getHammerDevLaunchPreset("tongs-stub-clean"), recordingRevisionId: "revision", visualTimeline: timeline, visualPlacements: canonicalSnapshot.visual_placements.data, initialCurrentPass: "visual_assembly", onWorkspaceSnapshotChange });
    }
    document.body.innerHTML = "<div id='hammer-mounted-authority-root'></div>";
    createRoot(document.getElementById("hammer-mounted-authority-root")!).render(React.createElement(Harness));
  }, moduleUrls);
  await expect(page.locator("section.hammer-timeline-dock")).toBeVisible();
  await expect(page.locator(".hammer-timeline-block--image, .hammer-timeline-block--broll")).toHaveCount(30);
  await expect.poll(() => page.evaluate(() => (window as any).__hammerAuthorityMetrics.completed)).toBe(true);
  await page.waitForTimeout(1_500);
  const metrics = await page.evaluate(() => (window as any).__hammerAuthorityMetrics);
  expect(metrics).toMatchObject({ revisionWrites: 1, workpieceWrites: 1, clips: 30, assets: 30, approvals: 29, timelinePath: "canonical-timeline", identity: metrics.initialIdentity, identityPreserved: true, timerPending: false, completed: true });
  expect(metrics.emissions).toBe(metrics.emissionsAtReconcile);
});

test("automatic placement remains behind the canonical resolver authority", async () => {
  const authority = fs.readFileSync(path.resolve(process.cwd(), "../hammer/src/editor/useHammerWorkspaceShellAutomaticPlacement.ts"), "utf8");
  expect(authority).toContain("resolveHammerAutomaticPlacementCommand");
  expect(authority).not.toContain("setEditableVisualTimeline");
});
