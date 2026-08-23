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
  he8Telemetry: viteFsUrl("apps/nursery/src/lib/hammer/he8NativeTelemetry.ts"),
};

test("HE-8 native telemetry is absent without its exact local staging flag", async ({ page }) => {
  await page.goto("/?workspace_id=494c2ae5-9037-4208-b898-fab4898ab430");
  const result = await page.evaluate(async (url) => {
    const { installHe8NativeTelemetry, HE8_NATIVE_TELEMETRY_TEST_CONTRACT } = await import(url);
    return {
      installed: installHe8NativeTelemetry() !== null,
      evidenceCount: document.querySelectorAll(`#${HE8_NATIVE_TELEMETRY_TEST_CONTRACT.evidenceElementId}`).length,
    };
  }, moduleUrls.he8Telemetry);
  expect(result).toEqual({ installed: false, evidenceCount: 0 });
});

test("HE-8 native telemetry passively records one trusted authorized placement action", async ({ page }) => {
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutationRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/?workspace_id=494c2ae5-9037-4208-b898-fab4898ab430&hammer_he8_native_telemetry=florida-placement-f89a4ff5-v1");
  const contract = await page.evaluate(async (url) => {
    const { installHe8NativeTelemetry, HE8_NATIVE_TELEMETRY_TEST_CONTRACT } = await import(url);
    document.body.innerHTML = `
      <div class="hammer-pass-head"><span>Transcript Cleanup</span></div>
      <button type="button" data-clip-id="${HE8_NATIVE_TELEMETRY_TEST_CONTRACT.placementId}">Authorized placement</button>
    `;
    const target = document.querySelector<HTMLElement>(`[data-clip-id="${HE8_NATIVE_TELEMETRY_TEST_CONTRACT.placementId}"]`)!;
    target.addEventListener("mousedown", () => {
      target.classList.add("is-selected");
      document.querySelector(".hammer-pass-head span")!.textContent = "Image Placement";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove Clip";
      document.body.append(remove);
    });
    const search = `?workspace_id=${HE8_NATIVE_TELEMETRY_TEST_CONTRACT.workspaceId}&${HE8_NATIVE_TELEMETRY_TEST_CONTRACT.flag}=${HE8_NATIVE_TELEMETRY_TEST_CONTRACT.flagValue}`;
    return { ...HE8_NATIVE_TELEMETRY_TEST_CONTRACT, installed: installHe8NativeTelemetry(search) !== null };
  }, moduleUrls.he8Telemetry);
  expect(contract.installed).toBe(true);
  await page.locator(`[data-clip-id="${contract.placementId}"]`).click();
  await page.waitForTimeout(100);
  const evidence = JSON.parse(await page.locator(`#${contract.evidenceElementId}`).textContent() ?? "null");
  expect(evidence.events.map((event: { event: string }) => event.event)).toEqual(["pointerdown", "mousedown", "focus", "pointerup", "click"]);
  expect(evidence.events.every((event: { isTrusted: boolean; placementId: string }) => event.isTrusted && event.placementId === contract.placementId)).toBe(true);
  expect(evidence.events.every((event: { composedPath: unknown[] }) => event.composedPath.length > 0)).toBe(true);
  expect(evidence.shellTransitions.at(-1)?.snapshot).toEqual({ selectedPlacementIds: [contract.placementId], passLabel: "Image Placement", removeClipVisible: true });
  expect(mutationRequests).toEqual([]);
});

test("visual clips beyond playback duration retain distinct native pointer targets", async ({ page }) => {
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
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
        .hammer-visual-timeline-lane__track { position: relative; width: 160px; min-height: 44px; overflow: hidden; }
        .hammer-visual-clip-block { position: absolute; height: 32px; box-sizing: border-box; padding: 0; }
      </style>
      <div id="hammer-visual-hit-test-root"></div>
    `;
    createRoot(document.getElementById("hammer-visual-hit-test-root")!).render(
      React.createElement(VisualTimelineDock, {
        clips: [
          { clipId: "placement-target", label: "Entire seasons lost.", startSec: 386.5, endSec: 389.2, selected: false },
          { clipId: "placement-exact-duplicate", label: "Entire supply chains evaporated.", startSec: 386.5, endSec: 389.2, selected: false },
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
  const duplicate = page.locator('[data-clip-id="placement-exact-duplicate"]');
  const later = page.locator('[data-clip-id="placement-later"]');
  await expect(target).toBeVisible();
  await expect(duplicate).toBeVisible();
  await expect(later).toBeVisible();
  const targetBox = await target.boundingBox();
  const duplicateBox = await duplicate.boundingBox();
  const laterBox = await later.boundingBox();
  expect(targetBox).not.toBeNull();
  expect(laterBox).not.toBeNull();
  expect(duplicateBox).not.toBeNull();
  expect(targetBox?.y).not.toBe(duplicateBox?.y);
  expect(targetBox?.y).not.toBe(laterBox?.y);

  await page.locator(".hammer-visual-timeline-lane__track").evaluate((track) => {
    (track as HTMLElement).style.width = "800px";
  });
  await expect.poll(async () => (await target.boundingBox())?.y).toBe((await later.boundingBox())?.y);
  expect((await target.boundingBox())?.y).not.toBe((await duplicate.boundingBox())?.y);

  await page.locator(".hammer-visual-timeline-lane__track").evaluate((track) => {
    (track as HTMLElement).style.width = "160px";
  });
  await expect.poll(async () => (await target.boundingBox())?.y).not.toBe((await later.boundingBox())?.y);

  await target.click();
  await duplicate.click();
  await later.click();
  await expect.poll(() => page.evaluate(() => (
    (window as any).__hammerTimelineHitTestSelections as string[]
  ).filter((value, index, values) => index === 0 || value !== values[index - 1]))).toEqual([
    "placement-target",
    "placement-exact-duplicate",
    "placement-later",
  ]);
  expect(mutationRequests).toEqual([]);
});

test("Florida-shaped editable clip remains selected when mousedown reflows the timeline before click", async ({ page }) => {
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(async (urls) => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { default: VisualTimelineDock } = await import(urls.visualTimelineDock);
    const targetId = "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2";
    const duplicateId = "placement_mm_from_media_still_broll-beat-155848e3-0799-44b2-9fea-9457bfd48cdf";
    const interceptorId = "placement_6c70e9c8-575b-4849-abd2-86377bc7334e";
    const evidence = { events: [] as any[], transitions: [] as any[], renders: [] as any[] };
    (window as any).__hammerSelectionRaceEvidence = evidence;
    document.body.innerHTML = `
      <style>
        .hammer-visual-timeline-lane__track { position: relative; width: 160px; min-height: 44px; overflow: hidden; }
        .hammer-visual-clip-block { position: absolute; height: 32px; box-sizing: border-box; padding: 0; }
      </style>
      <div id="hammer-selection-race-root"></div>
    `;
    for (const eventName of ["pointerdown", "pointerup", "click"] as const) {
      document.addEventListener(eventName, (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-clip-id]") : null;
        const selected = document.querySelector(`[data-clip-id="${targetId}"]`);
        const rect = selected?.getBoundingClientRect();
        evidence.events.push({
          event: eventName,
          target_id: target?.getAttribute("data-clip-id") ?? null,
          target_instance: target?.getAttribute("data-instance") ?? null,
          selected_instance: selected?.getAttribute("data-instance") ?? null,
          selected_geometry: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        });
      }, true);
    }
    function Harness() {
      const [selectedId, setSelectedId] = React.useState<string | null>(null);
      const [shifted, setShifted] = React.useState(false);
      React.useEffect(() => {
        evidence.renders.push({ selected_id: selectedId, shifted });
      }, [selectedId, shifted]);
      const clips = [
        { clipId: targetId, label: "Entire seasons lost.", startSec: 380.456, endSec: 383.206 },
        { clipId: duplicateId, label: "Duplicate interval", startSec: 380.456, endSec: 383.206 },
        { clipId: interceptorId, label: "Former interceptor", startSec: 410.578, endSec: 413.278 },
      ].map((clip) => ({ ...clip, selected: selectedId === clip.clipId }));
      return React.createElement("div", { style: { transform: shifted ? "translateY(120px)" : "none" } },
        React.createElement(VisualTimelineDock, {
          clips,
          playheadSec: 0,
          durationSec: 487.6,
          selectedClipId: selectedId,
          editable: true,
          onSelectClip: (clipId: string) => {
            evidence.transitions.push({ from: selectedId, to: clipId, reason: "select" });
            setSelectedId(clipId);
          },
          onMoveClip: () => {
            evidence.transitions.push({ from: selectedId, to: selectedId, reason: "editable_mousedown_reflow" });
            setShifted(true);
          },
        }),
      );
    }
    createRoot(document.getElementById("hammer-selection-race-root")!).render(React.createElement(Harness));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.querySelector(`[data-clip-id="${targetId}"]`)?.setAttribute("data-instance", "target-stable-node");
  }, moduleUrls);

  const target = page.locator('[data-clip-id="placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2"]');
  await target.click();
  await expect(target).toHaveClass(/is-selected/);
  await expect.poll(() => page.evaluate(() => (window as any).__hammerSelectionRaceEvidence.renders.at(-1))).toEqual({
    selected_id: "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2",
    shifted: true,
  });
  const evidence = await page.evaluate(() => (window as any).__hammerSelectionRaceEvidence);
  expect(evidence.events[0]).toMatchObject({
    event: "pointerdown",
    target_id: "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2",
    target_instance: "target-stable-node",
    selected_instance: "target-stable-node",
  });
  expect(evidence.events[1]).toMatchObject({
    event: "pointerup",
    target_id: null,
    selected_instance: "target-stable-node",
  });
  expect(evidence.events[2]).toMatchObject({
    event: "click",
    target_id: null,
    selected_instance: "target-stable-node",
  });
  expect(evidence.events[1].selected_geometry.y - evidence.events[0].selected_geometry.y).toBe(120);
  expect(evidence.transitions.filter((transition: any) => transition.reason === "select")).toEqual([{
    from: null,
    to: "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2",
    reason: "select",
  }]);
  expect(mutationRequests).toEqual([]);
});

test("Florida-shaped below-viewport clip remains selected after locator scroll and reconciliation settle", async ({ page }) => {
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(async (urls) => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { default: VisualTimelineDock } = await import(urls.visualTimelineDock);
    const targetId = "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2";
    const duplicateId = "placement_mm_from_media_still_broll-beat-155848e3-0799-44b2-9fea-9457bfd48cdf";
    const interceptorId = "placement_6c70e9c8-575b-4849-abd2-86377bc7334e";
    const evidence = {
      events: [] as any[],
      transitions: [] as any[],
      renders: [] as any[],
      geometry: {} as Record<string, any>,
      transcriptSegmentCount: 137,
      placementCount: 30,
    };
    (window as any).__hammerScrolledSelectionEvidence = evidence;
    document.body.innerHTML = `
      <style>
        body { margin: 0; }
        #scroll-spacer { height: 880px; }
        .hammer-visual-timeline-lane__track { position: relative; width: 960px; min-height: 116px; overflow: hidden; }
        .hammer-visual-clip-block { position: absolute; height: 32px; box-sizing: border-box; padding: 0; }
      </style>
      <div id="scroll-spacer"></div>
      <div id="hammer-scrolled-selection-root"></div>
    `;
    const geometry = () => {
      const element = document.querySelector(`[data-clip-id="${targetId}"]`);
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    for (const eventName of ["pointerdown", "mousedown", "focus", "pointerup", "click"] as const) {
      document.addEventListener(eventName, (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-clip-id]") : null;
        evidence.events.push({
          event: eventName,
          target_id: target?.getAttribute("data-clip-id") ?? null,
          target_instance: target?.getAttribute("data-instance") ?? null,
          scroll_y: window.scrollY,
          geometry: geometry(),
        });
      }, true);
    }
    function Harness() {
      const [selectedId, setSelectedId] = React.useState<string | null>(null);
      const [reconcileGeneration, setReconcileGeneration] = React.useState(0);
      const reconciledGeneration = React.useRef(0);
      React.useLayoutEffect(() => {
        if (reconcileGeneration === 0 || reconciledGeneration.current === reconcileGeneration) return;
        reconciledGeneration.current = reconcileGeneration;
        evidence.transitions.push({ from: targetId, to: null, reason: "scroll_focus_reconciliation" });
        setSelectedId(null);
      }, [reconcileGeneration]);
      React.useEffect(() => {
        evidence.renders.push({ selected_id: selectedId, reconcile_generation: reconcileGeneration });
      }, [reconcileGeneration, selectedId]);
      const exact = [
        { clipId: targetId, label: "Entire seasons lost.", startSec: 380.456, endSec: 383.206 },
        { clipId: duplicateId, label: "Duplicate interval", startSec: 380.456, endSec: 383.206 },
        { clipId: interceptorId, label: "Former interceptor", startSec: 410.578, endSec: 413.278 },
      ];
      const filler = Array.from({ length: 27 }, (_, index) => ({
        clipId: `synthetic-florida-placement-${String(index + 1).padStart(2, "0")}`,
        label: `Synthetic Florida placement ${index + 1}`,
        startSec: index * 12,
        endSec: (index * 12) + 3,
      }));
      const clips = [...filler, ...exact].map((clip) => ({ ...clip, selected: selectedId === clip.clipId }));
      return React.createElement(VisualTimelineDock, {
        clips,
        playheadSec: 0,
        durationSec: 487.6,
        selectedClipId: selectedId,
        editable: true,
        onSelectClip: (clipId: string) => {
          evidence.transitions.push({ from: selectedId, to: clipId, reason: "user_select" });
          setSelectedId(clipId);
        },
        onMoveClip: () => setReconcileGeneration((current: number) => current + 1),
      });
    }
    createRoot(document.getElementById("hammer-scrolled-selection-root")!).render(React.createElement(Harness));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const target = document.querySelector(`[data-clip-id="${targetId}"]`);
    target?.setAttribute("data-instance", "florida-target-stable-node");
    evidence.geometry.pre_scroll = geometry();
  }, moduleUrls);

  const target = page.locator('[data-clip-id="placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2"]');
  const preScroll = await page.evaluate(() => (window as any).__hammerScrolledSelectionEvidence.geometry.pre_scroll);
  expect(preScroll.y).toBeGreaterThan(720);
  await target.click();
  await expect(target).toHaveClass(/is-selected/);
  await expect.poll(() => page.evaluate(() => (window as any).__hammerScrolledSelectionEvidence.renders.at(-1)?.selected_id)).toBe(
    "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2",
  );
  const evidence = await page.evaluate(() => (window as any).__hammerScrolledSelectionEvidence);
  expect(evidence.transcriptSegmentCount).toBe(137);
  expect(evidence.placementCount).toBe(30);
  expect(evidence.events.map((event: any) => event.event)).toEqual([
    "pointerdown", "mousedown", "focus", "pointerup", "click",
  ]);
  expect(evidence.events.every((event: any) => event.target_id === "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2")).toBe(true);
  expect(evidence.events.every((event: any) => event.target_instance === "florida-target-stable-node")).toBe(true);
  expect(evidence.events[0].scroll_y).toBeGreaterThan(0);
  expect(evidence.events.at(-1).geometry.y).toBeLessThan(720);
  expect(evidence.transitions.map((transition: any) => transition.reason)).toEqual([
    "user_select", "scroll_focus_reconciliation", "user_select",
  ]);
  expect(evidence.transitions.at(-1).to).toBe("placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2");
  expect(mutationRequests).toEqual([]);
});

const mountedShellSourceDeskCases = [
  { mode: "success", settleBeforeSelectionMs: 250 },
  { mode: "pending", settleBeforeSelectionMs: 250 },
  { mode: "timeout", settleBeforeSelectionMs: 31_000 },
  { mode: "failure", settleBeforeSelectionMs: 250 },
] as const;

for (const sourceDeskCase of mountedShellSourceDeskCases) {
test(`mounted Florida-shaped shell retains visual selection while Source Desk is ${sourceDeskCase.mode}`, async ({ page }) => {
  test.setTimeout(sourceDeskCase.mode === "timeout" ? 60_000 : 30_000);
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.route("**/api/**", async (route) => {
    if (sourceDeskCase.mode === "pending" || sourceDeskCase.mode === "timeout") {
      await new Promise<void>(() => undefined);
      return;
    }
    if (sourceDeskCase.mode === "failure") {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "fixture_source_desk_unavailable" }) });
      return;
    }
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith("/storage")
      ? { ok: true, data: { listing: { nodes: [] } } }
      : { ok: true, exists: false };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(async (urls) => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { default: HammerWorkspaceShell } = await import(urls.shell);
    const { getHammerDevLaunchPreset } = await import(urls.presets);
    const { createDefaultSemanticAnchor, createDefaultVisualAnimation, createDefaultVisualGeometry } = await import(urls.defaults);
    const targetId = "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2";
    const duplicateId = "placement_mm_from_media_still_broll-beat-155848e3-0799-44b2-9fea-9457bfd48cdf";
    const interceptorId = "placement_6c70e9c8-575b-4849-abd2-86377bc7334e";
    const updatedAt = "2026-08-22T12:00:00.000Z";
    const transcriptSegments = Array.from({ length: 137 }, (_, index) => ({
      segment_id: `turn_${String(index + 1).padStart(3, "0")}`,
      start_sec: index * 3.6,
      end_sec: (index * 3.6) + 3,
      speaker: "S1",
      text: index === 106 ? "Entire seasons lost." : `Frozen Florida transcript segment ${index + 1}.`,
    }));
    const exactIds = [targetId, duplicateId, interceptorId];
    const placementIds = [
      ...Array.from({ length: 27 }, (_, index) => `synthetic-florida-placement-${String(index + 1).padStart(2, "0")}`),
      ...exactIds,
    ];
    const assets = placementIds.map((id, index) => ({
      asset_id: `asset-${index}`,
      asset_ref: `asset-${index}`,
      kind: id === targetId ? "video" : "image",
      label: id === targetId ? "Entire seasons lost." : `Florida visual ${index + 1}`,
      path: id === targetId ? `visuals/${index}.mp4` : `visuals/${index}.png`,
      storage_key: null,
      mime_type: id === targetId ? "video/mp4" : "image/png",
      source_mode: "manual",
      roles: ["timeline_visual"],
      updated_at: updatedAt,
    }));
    const clips = placementIds.map((id, index) => {
      const exactStart = id === targetId || id === duplicateId ? 380.456 : id === interceptorId ? 410.578 : index * 12;
      const exactEnd = id === targetId || id === duplicateId ? 383.206 : id === interceptorId ? 413.278 : (index * 12) + 3;
      return {
        clip_id: id,
        asset_id: assets[index].asset_id,
        lane_id: "lane:primary",
        entry_id: `entry-${index}`,
        label: assets[index].label,
        visual_mode: id === targetId ? "broll" : "image",
        confidence: id === targetId ? 0.3 : 1,
        placement_status: "placed",
        ingest_state: id === targetId ? "suggested" : "approved",
        uncertainty_flags: id === targetId ? ["low_confidence"] : [],
        start_sec: exactStart,
        end_sec: exactEnd,
        geometry: createDefaultVisualGeometry(),
        fit_mode: "contain",
        animation: createDefaultVisualAnimation(),
        opacity: 1,
        z_index: index,
        enabled: true,
        locked: false,
        source_mode: "manual",
        anchor_hint: { anchor_segment_id: "turn_107", matched_segment_ids: ["turn_107"], anchor_text: id === targetId ? "Entire seasons lost." : null, anchor_label: null, detached: false },
        semantic_anchor: createDefaultSemanticAnchor(),
        divergence: { state: "not_comparable", start_delta_sec: null, end_delta_sec: null },
        updated_at: updatedAt,
      };
    });
    const visualTimeline = {
      version: 2,
      revision: 8,
      updated_at: updatedAt,
      source_mode: "packaging",
      selected_clip_id: null,
      assets,
      clips,
      lanes: [{ lane_id: "lane:primary", label: "Visuals", clip_ids: placementIds }],
      debug_origin: "canonical_load",
    };
    const visualPlacements = {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:frozen-florida"],
      uncertainty_flags: ["three_review_flags"],
      placements: clips.map((clip: any) => ({
        placement_id: clip.clip_id,
        entry_id: clip.entry_id,
        anchor_segment_id: "turn_107",
        matched_segment_ids: ["turn_107"],
        anchor_text: clip.clip_id === targetId ? "Entire seasons lost." : null,
        asset_ref: clip.asset_id,
        asset_id: clip.asset_id,
        asset_path: clip.clip_id === targetId ? `visuals/${clip.asset_id}.mp4` : `visuals/${clip.asset_id}.png`,
        storage_key: null,
        label: clip.label,
        visual_mode: clip.clip_id === targetId ? "broll" : "image",
        start_sec: clip.start_sec,
        end_sec: clip.end_sec,
        confidence: clip.confidence,
        timing_source: "ordered_fallback",
        status: "placed",
        ingest_state: clip.ingest_state,
        uncertainty_flags: clip.uncertainty_flags,
      })),
    };
    const structuredTranscript = {
      schema_version: 1,
      transcript_id: "frozen-florida-transcript",
      media_id: "frozen-florida-media",
      media_signature: "frozen-florida-signature",
      prepared_at: updatedAt,
      structure: "speaker_turns",
      source_media_ref: null,
      diarization: { label_scheme: "forge-neutral-speakers.v1", labels: ["S1"], raw_labels: ["speaker_0"], version: "fixture", provider: "fixture", provider_request_id: "fixture", model: "fixture" },
      confidence_flags: [],
      segments: transcriptSegments,
      derived_text_layers: { schema_version: 1, active_layer_id: null, output_layer_id: null, layers: [] },
      subtitle_outputs: { schema_version: 1, last_generated_format: null, srt: null, vtt: null },
    };
    const evidence = { emissions: 0, events: [] as any[], selectedSnapshots: [] as string[][] };
    (window as any).__hammerMountedFloridaSelectionEvidence = evidence;
    let priorSelectedSnapshot = "";
    const recordSelectedSnapshot = () => {
      const selectedIds = Array.from(document.querySelectorAll("[data-clip-id].is-selected"))
        .map((element) => element.getAttribute("data-clip-id") ?? "");
      const serialized = JSON.stringify(selectedIds);
      if (serialized === priorSelectedSnapshot) return;
      priorSelectedSnapshot = serialized;
      evidence.selectedSnapshots.push(selectedIds);
    };
    new MutationObserver(recordSelectedSnapshot).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
    recordSelectedSnapshot();
    for (const eventName of ["pointerdown", "mousedown", "focus", "pointerup", "click"] as const) {
      document.addEventListener(eventName, (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-clip-id]") : null;
        evidence.events.push({ event: eventName, target_id: target?.getAttribute("data-clip-id") ?? null });
      }, true);
    }
    document.body.innerHTML = "<div id='hammer-mounted-florida-selection-root'></div>";
    createRoot(document.getElementById("hammer-mounted-florida-selection-root")!).render(React.createElement(HammerWorkspaceShell, {
      launchContext: getHammerDevLaunchPreset("tongs-stub-clean"),
      recordingRevisionId: "frozen-florida-revision",
      structuredTranscript,
      visualTimeline,
      visualPlacements,
      initialCurrentPass: "transcript_cleanup",
      onWorkspaceSnapshotChange: () => { evidence.emissions += 1; },
    }));
  }, moduleUrls);

  const target = page.locator('[data-clip-id="placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2"]');
  await expect(target).toHaveCount(1);
  const preClickBox = await target.boundingBox();
  expect(preClickBox?.y).toBeGreaterThan(720);
  const emissionsBefore = await page.evaluate(() => (window as any).__hammerMountedFloridaSelectionEvidence.emissions);
  await target.click();
  await expect(target).toHaveClass(/is-selected/);
  await page.waitForTimeout(sourceDeskCase.settleBeforeSelectionMs);
  await expect(target).toHaveClass(/is-selected/);
  await expect(page.getByLabel("Visual tools").getByRole("button", { name: "B-roll", exact: true })).toHaveClass(/is-selected/);
  const removeTarget = page.getByRole("button", { name: `Remove selected B-roll clip ${"placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2"}`, exact: true });
  await expect(removeTarget).toBeVisible();
  await expect(removeTarget).toHaveAttribute("data-placement-id", "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2");
  const evidence = await page.evaluate(() => (window as any).__hammerMountedFloridaSelectionEvidence);
  expect(evidence.events.map((event: any) => event.event)).toEqual(["pointerdown", "mousedown", "focus", "pointerup", "click"]);
  expect(evidence.events.slice(0, 2).every((event: any) => event.target_id === "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2")).toBe(true);
  const firstSelectedSnapshot = evidence.selectedSnapshots.findIndex((ids: string[]) => ids.length > 0);
  expect(firstSelectedSnapshot).toBeGreaterThanOrEqual(0);
  expect(evidence.selectedSnapshots.slice(firstSelectedSnapshot)).toEqual([
    ["placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2"],
  ]);
  expect(evidence.emissions).toBe(emissionsBefore + 1);
  expect(mutationRequests).toEqual([]);
  if (sourceDeskCase.mode === "success") {
    await removeTarget.click();
    await expect(target).toHaveCount(0);
    await expect(page.getByText("History: 1 undo / 0 redo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Undo/ }).click();
    await expect(target).toHaveCount(1);
    await expect(page.getByText("History: 0 undo / 1 redo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Redo/ }).click();
    await expect(target).toHaveCount(0);
    await expect(page.getByText("History: 1 undo / 0 redo", { exact: true })).toBeVisible();
    expect(mutationRequests).toEqual([]);
  }
});
}

test("archived-history notice keeps Visuals controls inside the exact 1280x720 staging viewport", async ({ page }) => {
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).__hammerResponsiveControlClicks = [];
    document.body.innerHTML = `
      <section class="hammer-workspace-shell is-tool-focus" style="height:720px">
        <div class="hammer-workspace-shell__notices">
          <aside class="hammer-history-epoch-notice">Archived history is preserved.</aside>
        </div>
        <div class="hammer-workspace-shell__main">
          <div class="hammer-workspace-shell__top">
            <section class="hammer-source-bay"><div class="hammer-bay-body">Source</div></section>
            <section class="hammer-preview-bay"><div class="hammer-bay-body">Preview</div></section>
            <section class="hammer-tool-bay">
              <div class="hammer-bay-body">
                <section class="hammer-tool-card hammer-visual-tool-selector">
                  <div class="hammer-source-card__actions">
                    <button type="button">Visuals</button>
                    <button type="button">Images</button>
                    <button type="button">Remove Clip</button>
                  </div>
                </section>
              </div>
            </section>
          </div>
          <section class="hammer-timeline-dock">Timeline</section>
        </div>
        <nav class="hammer-toolbar">Tools</nav>
      </section>
    `;
    for (const button of document.querySelectorAll(".hammer-tool-bay button")) {
      button.addEventListener("click", () => (window as any).__hammerResponsiveControlClicks.push(button.textContent));
    }
  });

  const assertContained = async (viewportWidth: number) => {
    await page.setViewportSize({ width: viewportWidth, height: 720 });
    const geometry = await page.locator(".hammer-workspace-shell").evaluate((shell) => {
      const box = (selector: string) => {
        const rect = shell.querySelector(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      return {
        shell: box(".hammer-workspace-shell__main"),
        top: box(".hammer-workspace-shell__top"),
        tool: box(".hammer-tool-bay"),
        remove: box(".hammer-tool-bay button:last-child"),
      };
    });
    expect(geometry.shell.width).toBeGreaterThan(700);
    expect(geometry.top.right).toBeLessThanOrEqual(geometry.shell.right + 0.5);
    expect(geometry.tool.right).toBeLessThanOrEqual(geometry.top.right + 0.5);
    expect(geometry.remove.right).toBeLessThanOrEqual(geometry.tool.right + 0.5);
    await expect(page.getByRole("button", { name: "Remove Clip", exact: true })).toBeVisible();
  };

  await assertContained(1280);
  await page.getByRole("button", { name: "Visuals", exact: true }).click();
  await page.getByRole("button", { name: "Images", exact: true }).click();
  await page.getByRole("button", { name: "Remove Clip", exact: true }).click();
  await assertContained(960);
  await assertContained(1280);
  await expect.poll(() => page.evaluate(() => (window as any).__hammerResponsiveControlClicks)).toEqual([
    "Visuals",
    "Images",
    "Remove Clip",
  ]);
  expect(mutationRequests).toEqual([]);
});

test.beforeEach(async ({ baseURL, page }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  expect(["127.0.0.1", "::1", "localhost"]).toContain(host);
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/*", async (route) => {
    const requestHost = new URL(route.request().url()).hostname;
    if (["127.0.0.1", "::1", "localhost"].includes(requestHost)) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
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
