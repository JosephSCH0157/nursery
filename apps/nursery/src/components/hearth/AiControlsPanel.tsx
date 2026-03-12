import * as React from "react";
import type { AiBehavior, AiLane } from "../../lib/hearth/ai-settings";
import {
  loadAiSettings,
  saveAiSettings,
  clearByoKey,
  hasByoKey,
} from "../../lib/hearth/ai-settings";
import {
  addMyStyleSamples,
  getStyleInsights,
  getWorkspaceFeatures,
  isAdaptiveStyleAccelerateEnabled,
  isAdaptiveStyleEnabled,
  isStyleAlignmentPaused,
  listRecentWorkspaceScriptReferences,
  readWorkpieceStyleSourceText,
  resetStyleProfile,
  setStyleAlignmentPaused,
  WORKSPACE_FEATURES_CHANGED_EVENT,
  type RecentScriptReference,
  type StyleSampleInput,
  type WorkspaceFeaturesChangedEventDetail,
  type WorkspaceFeatures,
} from "@hearth/lib/hearth-style-service";

type Props = {
  onClose: () => void;
  workspaceId?: string | null;
  workspaceRole?: string | null;
};

function roleCanManageFeatures(role: string | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

function confidenceLabel(scriptCount: number): "Emerging" | "Established" {
  return scriptCount >= 8 ? "Established" : "Emerging";
}

type AccelerateLearningTab = "upload" | "paste" | "forge";

type PendingStyleSample = {
  id: string;
  sourceKind: StyleSampleInput["sourceKind"];
  sourceLabel: string | null;
  sourceWorkpieceId: string | null;
  sourcePath: string | null;
  content: string;
};

type MammothApi = {
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value?: string }>;
};

let mammothLoaderPromise: Promise<MammothApi | null> | null = null;

function createPendingSampleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sample:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
}

function trimPreview(text: string, maxChars = 220): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function formatPendingSampleLabel(sample: PendingStyleSample): string {
  if (sample.sourceLabel) return sample.sourceLabel;
  if (sample.sourceKind === "paste") return "Pasted text";
  if (sample.sourceKind === "upload") return "Uploaded file";
  if (sample.sourceKind === "forge_script") return "Forge script";
  if (sample.sourceKind === "forge_transcript") return "Forge transcript";
  return "Style sample";
}

function formatForgeDate(value: string | null): string {
  if (!value) return "unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "unknown";
  return new Date(parsed).toLocaleDateString();
}

function isDocxFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  return name.endsWith(".docx")
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function isTextLikeFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return true;
  return file.type === "text/plain" || file.type === "text/markdown";
}

function appendScriptTag(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-hearth-mammoth="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load DOCX parser.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.dataset.hearthMammoth = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Failed to load DOCX parser.")), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureMammothApi(): Promise<MammothApi | null> {
  const runtime = window as Window & typeof globalThis & { mammoth?: unknown };
  const existing = runtime.mammoth as MammothApi | undefined;
  if (existing && typeof existing.extractRawText === "function") {
    return existing;
  }

  if (!mammothLoaderPromise) {
    mammothLoaderPromise = (async () => {
      const urls = [
        "https://unpkg.com/mammoth/mammoth.browser.min.js",
        "https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js",
      ];
      for (const url of urls) {
        try {
          await appendScriptTag(url);
          const loaded = runtime.mammoth as MammothApi | undefined;
          if (loaded && typeof loaded.extractRawText === "function") {
            return loaded;
          }
        } catch {
          // try next source
        }
      }
      return null;
    })();
  }

  return mammothLoaderPromise;
}

async function readUploadedFileText(file: File): Promise<string> {
  if (isDocxFile(file)) {
    const mammoth = await ensureMammothApi();
    if (!mammoth) {
      throw new Error("DOCX parser unavailable. Use .txt or .md.");
    }
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = typeof result.value === "string" ? result.value.trim() : "";
    if (!text) {
      throw new Error("DOCX file has no extractable text.");
    }
    return text;
  }

  if (!isTextLikeFile(file)) {
    throw new Error("Unsupported file type. Use .txt, .md, or .docx.");
  }

  const text = (await file.text()).trim();
  if (!text) {
    throw new Error("File is empty.");
  }
  return text;
}

function toStyleSampleInput(sample: PendingStyleSample): StyleSampleInput {
  return {
    sourceKind: sample.sourceKind,
    sourceLabel: sample.sourceLabel,
    sourceWorkpieceId: sample.sourceWorkpieceId,
    sourcePath: sample.sourcePath,
    content: sample.content,
  };
}

function makeForgeReferenceKey(ref: RecentScriptReference): string {
  return `${ref.workpieceId}:${ref.scriptPath}`;
}

export function AiControlsPanel({ onClose, workspaceId = null, workspaceRole = null }: Props) {
  const [settings, setSettings] = React.useState(() => loadAiSettings());
  const [keyDraft, setKeyDraft] = React.useState(settings.byoKey ?? "");
  const keyOk = hasByoKey();
  const [features, setFeatures] = React.useState<WorkspaceFeatures | null>(null);
  const [featuresLoading, setFeaturesLoading] = React.useState(false);
  const [featuresError, setFeaturesError] = React.useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = React.useState(false);
  const [insightsLoading, setInsightsLoading] = React.useState(false);
  const [insightsError, setInsightsError] = React.useState<string | null>(null);
  const [insightsLines, setInsightsLines] = React.useState<string[]>([]);
  const [insightsMeta, setInsightsMeta] = React.useState<{
    scriptsAnalyzedCount: number;
    confidence: "Emerging" | "Established";
  } | null>(null);
  const [alignmentPaused, setAlignmentPaused] = React.useState(() => isStyleAlignmentPaused(workspaceId));
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetNotice, setResetNotice] = React.useState<string | null>(null);
  const [accelerateModalOpen, setAccelerateModalOpen] = React.useState(false);
  const [accelerateTab, setAccelerateTab] = React.useState<AccelerateLearningTab>("upload");
  const [pendingSamples, setPendingSamples] = React.useState<PendingStyleSample[]>([]);
  const [sampleError, setSampleError] = React.useState<string | null>(null);
  const [sampleNotice, setSampleNotice] = React.useState<string | null>(null);
  const [sampleImportBusy, setSampleImportBusy] = React.useState(false);
  const [sampleIngestBusy, setSampleIngestBusy] = React.useState(false);
  const [pasteLabelDraft, setPasteLabelDraft] = React.useState("");
  const [pasteTextDraft, setPasteTextDraft] = React.useState("");
  const [forgeRefs, setForgeRefs] = React.useState<RecentScriptReference[]>([]);
  const [forgeRefsLoading, setForgeRefsLoading] = React.useState(false);
  const [forgeSelection, setForgeSelection] = React.useState<Record<string, boolean>>({});
  const insightsContainerRef = React.useRef<HTMLDivElement | null>(null);
  const canManageFeatures = roleCanManageFeatures(workspaceRole);
  const setFeatureSnapshot = React.useCallback((next: WorkspaceFeatures | null) => {
    setFeatures(next);
    if (!next || next.adaptiveStyleAlignmentEnabled !== true) {
      setInsightsOpen(false);
      setInsightsError(null);
      setInsightsLines([]);
      setInsightsMeta(null);
      setResetNotice(null);
    }
  }, []);

  React.useEffect(() => {
    setAlignmentPaused(isStyleAlignmentPaused(workspaceId));
  }, [workspaceId]);

  React.useEffect(() => {
    let cancelled = false;
    setInsightsOpen(false);
    setInsightsError(null);
    setInsightsLines([]);
    setInsightsMeta(null);
    setResetNotice(null);

    if (!workspaceId) {
      setFeatureSnapshot(null);
      setFeaturesError(null);
      return () => {
        cancelled = true;
      };
    }

    setFeaturesLoading(true);
    setFeaturesError(null);
    void getWorkspaceFeatures(workspaceId, { force: true })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setFeatureSnapshot(null);
          setFeaturesError(result.error);
          return;
        }
        setFeatureSnapshot(result.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load workspace features.";
        setFeaturesError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setFeaturesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, setFeatureSnapshot]);

  React.useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;

    const onWorkspaceFeaturesChanged = (event: Event) => {
      const custom = event as CustomEvent<WorkspaceFeaturesChangedEventDetail>;
      const detail = custom.detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      setFeaturesLoading(false);
      setFeaturesError(null);
      setFeatureSnapshot(detail.features);
    };

    window.addEventListener(WORKSPACE_FEATURES_CHANGED_EVENT, onWorkspaceFeaturesChanged as EventListener);
    return () => {
      window.removeEventListener(WORKSPACE_FEATURES_CHANGED_EVENT, onWorkspaceFeaturesChanged as EventListener);
    };
  }, [workspaceId, setFeatureSnapshot]);

  React.useEffect(() => {
    if (workspaceId) return;
    setAccelerateModalOpen(false);
    setPendingSamples([]);
    setSampleError(null);
    setSampleNotice(null);
    setSampleImportBusy(false);
    setSampleIngestBusy(false);
    setForgeRefs([]);
    setForgeSelection({});
  }, [workspaceId]);

  const loadForgeReferences = React.useCallback(async () => {
    if (!workspaceId) return;
    setForgeRefsLoading(true);
    setSampleError(null);
    const result = await listRecentWorkspaceScriptReferences(workspaceId, { limit: 24 });
    if (!result.ok) {
      setForgeRefs([]);
      setSampleError(result.error);
      setForgeRefsLoading(false);
      return;
    }
    setForgeRefs(result.data);
    setForgeSelection({});
    setForgeRefsLoading(false);
  }, [workspaceId]);

  React.useEffect(() => {
    if (!accelerateModalOpen) return;
    if (accelerateTab !== "forge") return;
    if (forgeRefsLoading || forgeRefs.length > 0) return;
    void loadForgeReferences();
  }, [accelerateModalOpen, accelerateTab, forgeRefs.length, forgeRefsLoading, loadForgeReferences]);

  function updateLane(lane: AiLane) {
    const next = { ...settings, lane };
    setSettings(next);
    saveAiSettings(next);
  }

  function updateBehavior(behavior: AiBehavior) {
    const next = { ...settings, behavior };
    setSettings(next);
    saveAiSettings(next);
  }

  function updateAutoApproveImageSpend(enabled: boolean) {
    const next = { ...settings, autoApproveImageSpend: enabled };
    setSettings(next);
    saveAiSettings(next);
  }

  function saveKey() {
    const next = { ...settings, byoKey: keyDraft };
    setSettings(next);
    saveAiSettings(next);
  }

  function clearKey() {
    clearByoKey();
    const next = loadAiSettings();
    setSettings(next);
    setKeyDraft("");
  }

  function toggleAlignmentPause() {
    const next = !alignmentPaused;
    setStyleAlignmentPaused(workspaceId, next);
    setAlignmentPaused(next);
  }

  async function onViewStyleInsights() {
    if (!workspaceId) {
      setInsightsError("Select a workspace to view style insights.");
      setInsightsOpen(true);
      return;
    }
    if (insightsLoading) return;
    if (insightsOpen) {
      setInsightsOpen(false);
      return;
    }
    setInsightsLoading(true);
    setInsightsError(null);
    setResetNotice(null);
    try {
      const result = await getStyleInsights(workspaceId);
      if (!result.ok) {
        setInsightsError(result.error);
        return;
      }
      if (!result.enabled) {
        setInsightsError("Adaptive Style Alignment is off for this workspace. Enable it in Settings.");
        setInsightsMeta(null);
        setInsightsLines([]);
        setInsightsOpen(true);
        return;
      }
      const scriptsAnalyzedCount = result.profile?.scriptsAnalyzedCount ?? 0;
      setInsightsMeta({
        scriptsAnalyzedCount,
        confidence: confidenceLabel(scriptsAnalyzedCount),
      });
      setInsightsLines(result.insights);
      setInsightsOpen(true);
      requestAnimationFrame(() => {
        insightsContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } finally {
      setInsightsLoading(false);
    }
  }

  async function onResumeOrBoostAlignment() {
    if (!workspaceId) {
      setResetNotice("Select a workspace to use alignment controls.");
      return;
    }
    const wasPaused = alignmentPaused;
    if (wasPaused) {
      setStyleAlignmentPaused(workspaceId, false);
      setAlignmentPaused(false);
      setResetNotice("Alignment resumed on this device.");
    } else {
      setResetNotice("Boost active. Approve scripts to increase adaptation speed.");
    }
    if (!insightsOpen || insightsLines.length === 0) {
      await onViewStyleInsights();
    } else {
      requestAnimationFrame(() => {
        insightsContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  function openAccelerateLearningModal() {
    if (!workspaceId) {
      setResetNotice("Select a workspace to accelerate learning.");
      return;
    }
    setAccelerateModalOpen(true);
    setAccelerateTab("upload");
    setSampleError(null);
    setSampleNotice(null);
    setPasteLabelDraft("");
    setPasteTextDraft("");
  }

  function closeAccelerateLearningModal() {
    setAccelerateModalOpen(false);
    setPendingSamples([]);
    setSampleError(null);
    setSampleNotice(null);
    setSampleImportBusy(false);
    setSampleIngestBusy(false);
    setPasteLabelDraft("");
    setPasteTextDraft("");
    setForgeRefs([]);
    setForgeSelection({});
  }

  async function onUploadSampleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setSampleImportBusy(true);
    setSampleError(null);
    setSampleNotice(null);

    const nextSamples: PendingStyleSample[] = [];
    const failures: string[] = [];

    for (const file of files) {
      try {
        const content = await readUploadedFileText(file);
        nextSamples.push({
          id: createPendingSampleId(),
          sourceKind: "upload",
          sourceLabel: file.name.trim() || "Uploaded sample",
          sourceWorkpieceId: null,
          sourcePath: null,
          content,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to parse file";
        failures.push(`${file.name}: ${message}`);
      }
    }

    if (nextSamples.length > 0) {
      setPendingSamples((prev) => [...prev, ...nextSamples]);
      setSampleNotice(`${nextSamples.length} sample(s) added to preview.`);
    }
    if (failures.length > 0) {
      setSampleError(failures.join(" "));
    }
    setSampleImportBusy(false);
  }

  function onAddPastedSample() {
    const content = pasteTextDraft.trim();
    if (!content) {
      setSampleError("Paste text before adding it to preview.");
      return;
    }
    setPendingSamples((prev) => [
      ...prev,
      {
        id: createPendingSampleId(),
        sourceKind: "paste",
        sourceLabel: pasteLabelDraft.trim() || null,
        sourceWorkpieceId: null,
        sourcePath: null,
        content,
      },
    ]);
    setPasteLabelDraft("");
    setPasteTextDraft("");
    setSampleError(null);
    setSampleNotice("Pasted text added to preview.");
  }

  function onToggleForgeSelection(ref: RecentScriptReference) {
    const key = makeForgeReferenceKey(ref);
    setForgeSelection((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  async function onAddForgeSelectionsToPreview() {
    if (!workspaceId) {
      setSampleError("Select a workspace first.");
      return;
    }
    const selected = forgeRefs.filter((ref) => forgeSelection[makeForgeReferenceKey(ref)] === true);
    if (selected.length === 0) {
      setSampleError("Select at least one Forge script.");
      return;
    }

    setSampleImportBusy(true);
    setSampleError(null);
    setSampleNotice(null);

    const nextSamples: PendingStyleSample[] = [];
    const failures: string[] = [];

    for (const ref of selected) {
      const result = await readWorkpieceStyleSourceText(ref.workpieceId, ref.scriptPath);
      if (!result.ok) {
        failures.push(`${ref.title} (${ref.scriptPath}): ${result.error}`);
        continue;
      }
      const content = result.data.trim();
      if (!content) {
        failures.push(`${ref.title} (${ref.scriptPath}): empty content.`);
        continue;
      }
      nextSamples.push({
        id: createPendingSampleId(),
        sourceKind: "forge_script",
        sourceLabel: `${ref.title} (${ref.scriptPath})`,
        sourceWorkpieceId: ref.workpieceId,
        sourcePath: ref.scriptPath,
        content,
      });
    }

    if (nextSamples.length > 0) {
      setPendingSamples((prev) => [...prev, ...nextSamples]);
      setSampleNotice(`${nextSamples.length} Forge sample(s) added to preview.`);
      setForgeSelection({});
    }
    if (failures.length > 0) {
      setSampleError(failures.join(" "));
    }
    setSampleImportBusy(false);
  }

  function onRemovePendingSample(sampleId: string) {
    setPendingSamples((prev) => prev.filter((sample) => sample.id !== sampleId));
  }

  async function onIngestPendingSamples() {
    if (!workspaceId || sampleIngestBusy) return;
    if (pendingSamples.length === 0) {
      setSampleError("Add at least one sample before ingest.");
      return;
    }

    setSampleIngestBusy(true);
    setSampleError(null);
    setSampleNotice(null);

    const result = await addMyStyleSamples(workspaceId, pendingSamples.map(toStyleSampleInput));
    if (!result.ok) {
      setSampleError(result.error);
      setSampleIngestBusy(false);
      return;
    }

    const { inserted, failed, errors } = result.data;
    if (errors.length > 0) {
      setSampleError(errors.join(" "));
    }
    setSampleNotice(
      failed > 0
        ? `Ingested ${inserted} sample(s), ${failed} failed.`
        : `Ingested ${inserted} style sample(s).`,
    );
    setResetNotice(`Accelerated learning corpus updated (${inserted} sample${inserted === 1 ? "" : "s"}).`);
    setPendingSamples([]);
    setSampleIngestBusy(false);
    setAccelerateModalOpen(false);
  }

  async function onResetStyleProfile() {
    if (!workspaceId || resetBusy) return;
    const confirmed = window.confirm("Reset adaptive style profile for this workspace?");
    if (!confirmed) return;
    setResetBusy(true);
    setResetNotice(null);
    setInsightsError(null);
    try {
      const result = await resetStyleProfile(workspaceId);
      if (!result.ok) {
        setResetNotice(result.error);
        return;
      }
      setInsightsMeta({
        scriptsAnalyzedCount: 0,
        confidence: "Emerging",
      });
      setInsightsLines([]);
      setInsightsOpen(true);
      setResetNotice(result.data ? "Style profile reset." : "Style profile already empty.");
    } finally {
      setResetBusy(false);
    }
  }

  const alignmentEnabled = isAdaptiveStyleEnabled(features);
  const accelerateEnabled = isAdaptiveStyleAccelerateEnabled(features);
  const selectedForgeCount = forgeRefs.reduce(
    (count, ref) => count + (forgeSelection[makeForgeReferenceKey(ref)] ? 1 : 0),
    0,
  );

  return (
    <div className="forge-ai-panel">
      <div className="forge-ai-panel__header">
        <div className="forge-ai-panel__title">AI Controls</div>
        <button type="button" className="forge-ai-panel__close" onClick={onClose} aria-label="Close">
          x
        </button>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Lane</div>
        <div className="forge-ai-panel__row">
          <label>
            <input
              type="radio"
              checked={settings.lane === "forge"}
              onChange={() => updateLane("forge")}
            />
            Forge-managed (dev key hidden)
          </label>
        </div>
        <div className="forge-ai-panel__row">
          <label>
            <input
              type="radio"
              checked={settings.lane === "byo"}
              onChange={() => updateLane("byo")}
            />
            Bring your own key
          </label>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Provider</div>
        <div className="forge-ai-panel__row">
          <select disabled value="openai">
            <option value="openai">OpenAI</option>
          </select>
          <div className="forge-ai-panel__hint">More providers later.</div>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">API Key (BYO only)</div>
        <div className="forge-ai-panel__row">
          <input
            type="password"
            placeholder="sk-..."
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            disabled={settings.lane !== "byo"}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="forge-ai-panel__row">
          <button type="button" onClick={saveKey} disabled={settings.lane !== "byo"}>
            Save
          </button>
          <button type="button" onClick={clearKey} disabled={settings.lane !== "byo"}>
            Clear
          </button>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Behavior</div>
        <div className="forge-ai-panel__row">
          <select
            value={settings.behavior}
            onChange={(event) => updateBehavior(event.target.value as AiBehavior)}
          >
            <option value="fast">Fast</option>
            <option value="careful">Careful</option>
            <option value="deterministic">Deterministic</option>
            <option value="creative">Creative</option>
          </select>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Image Spend Confirmation</div>
        <div className="forge-ai-panel__row">
          <label>
            <input
              type="checkbox"
              checked={settings.autoApproveImageSpend === true}
              onChange={(event) => updateAutoApproveImageSpend(event.target.checked)}
            />
            Always approve thumbnail generation spend
          </label>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Status</div>
        <div className="forge-ai-panel__row">
          {settings.lane === "forge" ? (
            <span>Using Forge dev key (hidden).</span>
          ) : keyOk ? (
            <span>BYO key saved.</span>
          ) : (
            <span>No BYO key set.</span>
          )}
        </div>
      </div>

      {!featuresLoading && !featuresError && workspaceId && alignmentEnabled ? (
        <div className="forge-ai-panel__section">
          <div className="forge-ai-panel__label">Adaptive Style Alignment</div>
          <div className="forge-ai-panel__style-status">
            <div className="forge-ai-panel__style-title">Growing with you</div>
            <div className="forge-ai-panel__style-confidence">
              Confidence: {insightsMeta?.confidence ?? "Emerging"}
            </div>
          </div>
          <div className="forge-ai-panel__row">
            <button
              type="button"
              onClick={() => void onViewStyleInsights()}
              disabled={insightsLoading}
            >
              {insightsLoading ? "Loading..." : insightsOpen ? "Hide Style Insights" : "View Style Insights"}
            </button>
            {accelerateEnabled ? (
              <button type="button" onClick={() => void onResumeOrBoostAlignment()}>
                {alignmentPaused ? "Resume Alignment" : "Boost Alignment"}
              </button>
            ) : null}
            {accelerateEnabled ? (
              <button type="button" onClick={openAccelerateLearningModal}>
                Accelerate Learning...
              </button>
            ) : null}
            <button type="button" onClick={toggleAlignmentPause}>
              {alignmentPaused ? "Resume Alignment" : "Pause Alignment"}
            </button>
            <button type="button" onClick={() => void onResetStyleProfile()} disabled={resetBusy}>
              {resetBusy ? "Resetting..." : "Reset Profile"}
            </button>
          </div>
          {insightsError ? <div className="forge-ai-panel__hint">{insightsError}</div> : null}
          {resetNotice ? <div className="forge-ai-panel__hint">{resetNotice}</div> : null}
          {alignmentPaused ? (
            <div className="forge-ai-panel__hint">Alignment is paused on this device.</div>
          ) : null}
          {insightsOpen ? (
            <div className="forge-ai-panel__style-insights" ref={insightsContainerRef}>
              <div className="forge-ai-panel__style-meta">
                Scripts analyzed: {insightsMeta?.scriptsAnalyzedCount ?? 0}
              </div>
              {insightsLines.length ? (
                <ul className="forge-ai-panel__style-list">
                  {insightsLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <div className="forge-ai-panel__hint">
                  No profile yet. Approve scripts to start learning your structure.
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {featuresLoading ? (
        <div className="forge-ai-panel__hint">Loading workspace features...</div>
      ) : null}
      {featuresError ? (
        <div className="forge-ai-panel__hint">{featuresError}</div>
      ) : null}
      {!workspaceId ? (
        <div className="forge-ai-panel__hint">Select a workspace to use adaptive style features.</div>
      ) : null}
      {workspaceId && !canManageFeatures ? (
        <div className="forge-ai-panel__hint">Workspace feature toggles are managed in Settings by Admin/Owner.</div>
      ) : null}

      <div className="forge-ai-panel__footer">
        <button type="button" onClick={onClose}>Done</button>
      </div>

      {accelerateModalOpen ? (
        <div className="forge-ai-panel__learning-backdrop" role="presentation">
          <div className="forge-ai-panel__learning-modal" role="dialog" aria-modal="true" aria-label="Accelerate learning">
            <div className="forge-ai-panel__learning-header">
              <div className="forge-ai-panel__learning-title">Accelerate Learning</div>
              <button type="button" onClick={closeAccelerateLearningModal} aria-label="Close accelerate learning">
                x
              </button>
            </div>

            <div className="forge-ai-panel__learning-tabs">
              <button
                type="button"
                data-active={accelerateTab === "upload" ? "1" : "0"}
                onClick={() => setAccelerateTab("upload")}
              >
                Upload
              </button>
              <button
                type="button"
                data-active={accelerateTab === "paste" ? "1" : "0"}
                onClick={() => setAccelerateTab("paste")}
              >
                Paste
              </button>
              <button
                type="button"
                data-active={accelerateTab === "forge" ? "1" : "0"}
                onClick={() => setAccelerateTab("forge")}
              >
                From Forge
              </button>
            </div>

            <div className="forge-ai-panel__learning-body">
              {accelerateTab === "upload" ? (
                <div className="forge-ai-panel__learning-section">
                  <div className="forge-ai-panel__hint">Upload .txt, .md, or .docx files.</div>
                  <input
                    type="file"
                    accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    multiple
                    onChange={(event) => void onUploadSampleFiles(event)}
                    disabled={sampleImportBusy || sampleIngestBusy}
                  />
                </div>
              ) : null}

              {accelerateTab === "paste" ? (
                <div className="forge-ai-panel__learning-section">
                  <input
                    type="text"
                    placeholder="Optional label"
                    value={pasteLabelDraft}
                    onChange={(event) => setPasteLabelDraft(event.target.value)}
                    disabled={sampleImportBusy || sampleIngestBusy}
                  />
                  <textarea
                    className="forge-ai-panel__learning-textarea"
                    placeholder="Paste writing sample text..."
                    value={pasteTextDraft}
                    onChange={(event) => setPasteTextDraft(event.target.value)}
                    disabled={sampleImportBusy || sampleIngestBusy}
                  />
                  <button
                    type="button"
                    onClick={onAddPastedSample}
                    disabled={sampleImportBusy || sampleIngestBusy}
                  >
                    Add To Preview
                  </button>
                </div>
              ) : null}

              {accelerateTab === "forge" ? (
                <div className="forge-ai-panel__learning-section">
                  <div className="forge-ai-panel__row">
                    <button
                      type="button"
                      onClick={() => void loadForgeReferences()}
                      disabled={forgeRefsLoading || sampleImportBusy || sampleIngestBusy}
                    >
                      {forgeRefsLoading ? "Loading..." : "Refresh"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onAddForgeSelectionsToPreview()}
                      disabled={sampleImportBusy || sampleIngestBusy || selectedForgeCount === 0}
                    >
                      Add Selected ({selectedForgeCount})
                    </button>
                  </div>
                  {forgeRefs.length ? (
                    <div className="forge-ai-panel__forge-list">
                      {forgeRefs.map((ref) => {
                        const key = makeForgeReferenceKey(ref);
                        const checked = forgeSelection[key] === true;
                        return (
                          <label key={key} className="forge-ai-panel__forge-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => onToggleForgeSelection(ref)}
                              disabled={sampleImportBusy || sampleIngestBusy}
                            />
                            <span>
                              {ref.title} - {ref.scriptPath} - ready {formatForgeDate(ref.markedReadyAt)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : forgeRefsLoading ? null : (
                    <div className="forge-ai-panel__hint">No recent scripts found.</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="forge-ai-panel__learning-preview">
              <div className="forge-ai-panel__label">Preview ({pendingSamples.length})</div>
              {pendingSamples.length ? (
                <ul className="forge-ai-panel__learning-list">
                  {pendingSamples.map((sample) => (
                    <li key={sample.id}>
                      <div className="forge-ai-panel__learning-item-head">
                        <strong>{formatPendingSampleLabel(sample)}</strong>
                        <button
                          type="button"
                          onClick={() => onRemovePendingSample(sample.id)}
                          disabled={sampleImportBusy || sampleIngestBusy}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="forge-ai-panel__hint">
                        {sample.sourceKind} - {sample.content.length} chars
                      </div>
                      <div className="forge-ai-panel__learning-snippet">{trimPreview(sample.content)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="forge-ai-panel__hint">No samples queued yet.</div>
              )}
            </div>

            {sampleError ? <div className="forge-ai-panel__hint">{sampleError}</div> : null}
            {sampleNotice ? <div className="forge-ai-panel__hint">{sampleNotice}</div> : null}

            <div className="forge-ai-panel__learning-actions">
              <button type="button" onClick={closeAccelerateLearningModal} disabled={sampleIngestBusy}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onIngestPendingSamples()}
                disabled={sampleIngestBusy || sampleImportBusy || pendingSamples.length === 0}
              >
                {sampleIngestBusy ? "Ingesting..." : "Ingest"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
