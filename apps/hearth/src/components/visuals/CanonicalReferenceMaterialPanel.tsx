import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addReferenceClip,
  createAndFulfillReferenceClipSource,
  readCanonicalReferenceClips,
  verifyReferenceClipHammerReadback,
  type ReferenceClipState,
} from "../../lib/hearth-reference-clip-authority";
import { readCanonicalReferenceVisualCollections } from "../../lib/hearth-reference-visual-collections";
import {
  selectReferenceVisual,
  type ReferenceVisualState,
} from "../../lib/hearth-reference-visual-authority";
import {
  readVisualOpportunityDispositions,
  setVisualOpportunityDisposition,
  type VisualOpportunityDisposition,
  type VisualSkipReason,
} from "../../lib/hearth-visual-disposition-authority";
import {
  projectReferenceReviewItems,
  verifyReferenceReviewHammerDecision,
  type ReferenceReviewItem,
} from "../../lib/hearth-reference-review";
import {
  finishReferenceReviewAttempt,
  readReferenceReviewFailures,
  startReferenceReviewAttempt,
} from "../../lib/hearth-reference-review-attempts";
import {
  buildReferenceVisualWorkflowFocus,
  isReferenceVisualFailureActionable,
  projectReferenceMaterialVisualAction,
  type ReferenceVisualWorkflowFocus,
} from "../../lib/hearth-reference-material-workflow";
import { subscribeToForgeUserAccessToken } from "../../lib/tongs-fetch";
import CanonicalReferenceVisualPanel from "./CanonicalReferenceVisualPanel";

type DrawerMode = "edit" | "replace" | "skip";
type Failure = {
  intent: "approve" | "skip" | "use_source" | "save_edits" | "replace";
  message: string;
};
const statusLabel = (state: ReferenceReviewItem["state"]) =>
  state === "hearth_is_working"
    ? "Hearth is working"
    : state === "ready"
      ? "Ready"
      : "Needs your decision";
const preferredScrollBehavior = (): ScrollBehavior =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
function hostTitle(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Linked source";
  }
}

export default function CanonicalReferenceMaterialPanel({
  workspaceId,
  workpieceId,
}: {
  workspaceId: string;
  workpieceId: string;
}) {
  const [clips, setClips] = useState<ReferenceClipState | null>(null),
    [visuals, setVisuals] = useState<ReferenceVisualState | null>(null),
    [dispositions, setDispositions] = useState<VisualOpportunityDisposition[]>(
      [],
    ),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState<string | null>(null),
    [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set()),
    [verifiedKeys, setVerifiedKeys] = useState<Set<string>>(new Set()),
    [failures, setFailures] = useState<Record<string, Failure>>({}),
    [drawer, setDrawer] = useState<{ key: string; mode: DrawerMode } | null>(
      null,
    ),
    [sourceUrl, setSourceUrl] = useState(""),
    [visualWorkflowFocus, setVisualWorkflowFocus] =
      useState<ReferenceVisualWorkflowFocus | null>(null),
    [skipReason, setSkipReason] = useState<VisualSkipReason>(
      "editorially_unneeded",
    ),
    [skipNote, setSkipNote] = useState("");
  const alive = useRef(true),
    refreshSequence = useRef(0),
    attempts = useRef(new Map<string, string>()),
    retryParents = useRef(new Map<string, string>()),
    returnCardKey = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const [clipResult, visualResult, dispositionResult, failureResult] =
      await Promise.all([
        readCanonicalReferenceClips(workspaceId, workpieceId),
        readCanonicalReferenceVisualCollections(workspaceId, workpieceId),
        readVisualOpportunityDispositions(workspaceId, workpieceId),
        readReferenceReviewFailures(workspaceId, workpieceId),
      ]);
    if (!alive.current || sequence !== refreshSequence.current) return;
    const failed = !clipResult.ok
      ? clipResult.error
      : !visualResult.ok
        ? visualResult.error
        : !dispositionResult.ok
          ? dispositionResult.error
          : null;
    setLoading(false);
    setLoadError(failed);
    if (clipResult.ok) setClips(clipResult.data);
    if (visualResult.ok) setVisuals(visualResult.data);
    if (dispositionResult.ok) setDispositions(dispositionResult.data);
    const projected =
      clipResult.ok && visualResult.ok && dispositionResult.ok
        ? projectReferenceReviewItems({
            clips: clipResult.data,
            visuals: visualResult.data,
            dispositions: dispositionResult.data,
          })
        : null;
    if (failureResult.ok) {
      const persisted: Record<string, Failure> = {};
      retryParents.current.clear();
      for (const failure of failureResult.data) {
        const item = projected?.find((entry) => entry.key === failure.key);
        if (item?.family === "reference_visual") {
          const opportunity = visualResult.ok
            ? visualResult.data?.opportunities.find(
                (entry) => entry.id === item.opportunityId,
              )
            : null;
          if (
            !opportunity ||
            !isReferenceVisualFailureActionable(
              failure.intent,
              projectReferenceMaterialVisualAction({
                opportunity,
                resolution: item.resolution,
                hammerVerified: false,
                approvalBlocked: Boolean(item.approveDisabledReason),
              }),
            )
          )
            continue;
        }
        persisted[failure.key] = {
          intent: failure.intent,
          message: failure.message,
        };
        retryParents.current.set(failure.key, failure.attemptId);
      }
      setFailures(persisted);
    }
    if (projected) {
      const resolved = projected.filter((item) => item.resolution !== null),
        checks = await Promise.all(
          resolved.map(async (item) => ({
            key: item.key,
            result: await verifyReferenceReviewHammerDecision(
              workpieceId,
              item,
              item.resolution!,
            ),
          })),
        );
      if (alive.current)
        setVerifiedKeys(
          new Set(
            checks.filter((check) => check.result.ok).map((check) => check.key),
          ),
        );
    }
  }, [workspaceId, workpieceId]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(
      "forge:canonical-reference-clips-changed",
      listener,
    );
    window.addEventListener(
      "forge:canonical-reference-visuals-changed",
      listener,
    );
    const unsubscribeFromAuth = subscribeToForgeUserAccessToken(listener);
    return () => {
      alive.current = false;
      unsubscribeFromAuth();
      window.removeEventListener(
        "forge:canonical-reference-clips-changed",
        listener,
      );
      window.removeEventListener(
        "forge:canonical-reference-visuals-changed",
        listener,
      );
    };
  }, [refresh]);
  const items = useMemo(
      () =>
        projectReferenceReviewItems({
          clips,
          visuals,
          dispositions,
          pendingKeys,
          hammerVerifiedKeys: verifiedKeys,
        }),
      [clips, visuals, dispositions, pendingKeys, verifiedKeys],
    ),
    activeDrawer = drawer
      ? (items.find((item) => item.key === drawer.key) ?? null)
      : null;
  function openDrawer(item: ReferenceReviewItem, mode: DrawerMode) {
    setDrawer({ key: item.key, mode });
  }

  function openReferenceVisualWorkflow(item: ReferenceReviewItem) {
    if (item.family !== "reference_visual") return;
    const opportunity = visuals?.opportunities.find(
      (entry) => entry.id === item.opportunityId,
    );
    if (!opportunity) return;
    setDrawer(null);
    setVisualWorkflowFocus(
      buildReferenceVisualWorkflowFocus({
        workspaceId,
        workpieceId,
        opportunity,
        returnCardKey: item.key,
      }),
    );
  }

  function closeReferenceVisualWorkflow() {
    returnCardKey.current = visualWorkflowFocus?.returnCardKey ?? null;
    setVisualWorkflowFocus(null);
    void refresh();
  }

  useEffect(() => {
    if (visualWorkflowFocus || !returnCardKey.current) return;
    const cardKey = returnCardKey.current;
    returnCardKey.current = null;
    requestAnimationFrame(() => {
      const card = document.getElementById(`${cardKey}-card`);
      card?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: "center",
      });
      card?.focus({ preventScroll: true });
    });
  }, [visualWorkflowFocus]);

  async function begin(item: ReferenceReviewItem, intent: Failure["intent"]) {
    setPendingKeys((current) => new Set(current).add(item.key));
    setFailures((current) => {
      const next = { ...current };
      delete next[item.key];
      return next;
    });
    const started = await startReferenceReviewAttempt({
      workspaceId,
      workpieceId,
      item,
      intent,
      parentAttemptId: retryParents.current.get(item.key) ?? null,
      aiAuthorization:
        intent === "use_source" ? "explicitly_approved" : "not_applicable",
    });
    if (!started.ok) {
      finish(item);
      setFailures((current) => ({
        ...current,
        [item.key]: { intent, message: started.error },
      }));
      return false;
    }
    attempts.current.set(item.key, started.data.attemptId);
    return true;
  }
  function finish(item: ReferenceReviewItem) {
    setPendingKeys((current) => {
      const next = new Set(current);
      next.delete(item.key);
      return next;
    });
  }
  function fail(
    item: ReferenceReviewItem,
    intent: Failure["intent"],
    message: string,
  ) {
    const attemptId = attempts.current.get(item.key);
    if (!attemptId) {
      finish(item);
      setFailures((current) => ({
        ...current,
        [item.key]: { intent, message },
      }));
      return;
    }
    void finishReferenceReviewAttempt({
      workpieceId,
      attemptId,
      outcome: "failed",
      failureCode: "reference_review_intent_failed",
      failureMessage: message,
    }).then((recorded) => {
      attempts.current.delete(item.key);
      if (recorded.ok) retryParents.current.set(item.key, attemptId);
      finish(item);
      setFailures((current) => ({
        ...current,
        [item.key]: {
          intent,
          message: recorded.ok ? message : `${message} ${recorded.error}`,
        },
      }));
    });
  }
  async function succeed(
    item: ReferenceReviewItem,
    intent: Failure["intent"],
    receipt: Record<string, unknown>,
  ) {
    const attemptId = attempts.current.get(item.key);
    if (attemptId) {
      const recorded = await finishReferenceReviewAttempt({
        workpieceId,
        attemptId,
        outcome: "succeeded",
        receipt,
      });
      if (!recorded.ok) {
        fail(item, intent, recorded.error);
        return false;
      }
      attempts.current.delete(item.key);
      retryParents.current.delete(item.key);
    }
    finish(item);
    return true;
  }
  async function approve(item: ReferenceReviewItem) {
    if (
      item.approveDisabledReason ||
      !item.candidate ||
      !(await begin(item, "approve"))
    )
      return;
    if (item.family === "reference_clip") {
      if (!clips) {
        fail(item, "approve", "Reference Clips are not available.");
        return;
      }
      const opportunity = clips.opportunities.find(
        (entry) => entry.id === item.opportunityId,
      );
      if (!opportunity) {
        fail(
          item,
          "approve",
          "This proposal changed before it could be approved.",
        );
        return;
      }
      const result = opportunity.selectedRevisionIds.includes(
        item.candidate.revisionId,
      )
        ? { ok: true as const, data: clips }
        : await addReferenceClip({
            workspaceId,
            workpieceId,
            state: clips,
            opportunity,
            candidateRevisionId: item.candidate.revisionId,
          });
      if (!result.ok) {
        fail(item, "approve", result.error);
        return;
      }
      const hammer = result.data
        ? await verifyReferenceClipHammerReadback(workpieceId, result.data)
        : {
            ok: false as const,
            error: "Canonical Clip readback was unavailable.",
          };
      if (!hammer.ok) {
        fail(item, "approve", hammer.error);
        return;
      }
      if (result.data) setClips(result.data);
    } else {
      if (!visuals) {
        fail(item, "approve", "Reference Visuals are not available.");
        return;
      }
      const opportunity = visuals.opportunities.find(
        (entry) => entry.id === item.opportunityId,
      );
      if (!opportunity) {
        fail(
          item,
          "approve",
          "This proposal changed before it could be approved.",
        );
        return;
      }
      if (
        opportunity.selectedCandidateRevisionId !== item.candidate.revisionId
      ) {
        const result = await selectReferenceVisual({
          workspaceId,
          workpieceId,
          state: visuals,
          opportunity,
          candidateRevisionId: item.candidate.revisionId,
        });
        if (!result.ok) {
          fail(item, "approve", result.error);
          return;
        }
      }
      const hammer = await verifyReferenceReviewHammerDecision(
        workpieceId,
        item,
        "approved",
      );
      if (!hammer.ok) {
        fail(item, "approve", hammer.error);
        return;
      }
    }
    if (
      !(await succeed(item, "approve", {
        resolution: "approved",
        native_candidate_revision_id: item.candidate.revisionId,
        hammer_verified: true,
      }))
    )
      return;
    setVerifiedKeys((current) => new Set(current).add(item.key));
    await refresh();
  }
  async function skip(item: ReferenceReviewItem) {
    if (!(await begin(item, "skip"))) return;
    const current =
        dispositions.find(
          (entry) =>
            entry.kind === item.family &&
            entry.opportunityId === item.opportunityId,
        ) ?? null,
      result = await setVisualOpportunityDisposition({
        workspaceId,
        workpieceId,
        kind: item.family,
        opportunityId: item.opportunityId,
        opportunityRevisionIdentity: item.opportunityRevisionId,
        childPlanRevisionId: item.planRevisionId,
        childPlanRevision: item.planRevision,
        current,
        state: "skipped",
        reason: skipReason,
        note: skipNote,
      });
    if (!result.ok) {
      fail(item, "skip", result.error);
      return;
    }
    const hammer = await verifyReferenceReviewHammerDecision(
      workpieceId,
      item,
      "skipped",
    );
    if (!hammer.ok) {
      fail(item, "skip", hammer.error);
      return;
    }
    if (
      !(await succeed(item, "skip", {
        resolution: "skipped",
        native_disposition_revision_id:
          result.data.find(
            (entry) =>
              entry.kind === item.family &&
              entry.opportunityId === item.opportunityId,
          )?.revisionId ?? null,
        hammer_verified_absent: true,
      }))
    )
      return;
    setDispositions(result.data);
    setVerifiedKeys((keys) => new Set(keys).add(item.key));
    setDrawer(null);
    setSkipNote("");
  }
  async function useSource(item: ReferenceReviewItem) {
    const url = sourceUrl.trim();
    if (item.family === "reference_visual") {
      openReferenceVisualWorkflow(item);
      return;
    }
    if (!url || !(await begin(item, "use_source"))) return;
    if (!clips) {
      fail(item, "use_source", "Reference Clips are not available.");
      return;
    }
    const opportunity = clips.opportunities.find(
      (entry) => entry.id === item.opportunityId,
    );
    if (!opportunity) {
      fail(
        item,
        "use_source",
        "This proposal changed before the Source could be used.",
      );
      return;
    }
    const linked = await createAndFulfillReferenceClipSource({
      workspaceId,
      workpieceId,
      opportunity,
      draft: {
        sourceType: "web",
        title: hostTitle(url),
        author: "",
        publisher: hostTitle(url),
        publishedAt: "",
        canonicalUrl: url,
        documentIdentity: `url:${url}`,
        relationshipNote: "Creator chose Use this source.",
        citation: {
          focus: opportunity.focus,
          before: opportunity.before,
          after: opportunity.after,
        },
        mediaRange: {},
      },
    });
    if (!linked.ok) {
      fail(item, "use_source", linked.error);
      return;
    }
    setClips(linked.data);
    if (
      !(await succeed(item, "use_source", {
        proposal_updated: true,
        native_plan_revision_id: item.planRevisionId,
      }))
    )
      return;
    setSourceUrl("");
    setDrawer(null);
    await refresh();
  }
  async function retry(item: ReferenceReviewItem) {
    const failure = failures[item.key];
    if (!failure) return;
    if (failure.intent === "approve") await approve(item);
    else if (failure.intent === "skip") await skip(item);
    else if (item.family === "reference_visual")
      openReferenceVisualWorkflow(item);
    else if (failure.intent === "use_source") await useSource(item);
    else if (failure.intent === "save_edits") openDrawer(item, "edit");
    else openDrawer(item, "replace");
  }

  function visualPrimaryAction(item: ReferenceReviewItem) {
    if (item.family !== "reference_visual") return null;
    const opportunity = visuals?.opportunities.find(
      (entry) => entry.id === item.opportunityId,
    );
    if (!opportunity) return null;
    return projectReferenceMaterialVisualAction({
      opportunity,
      resolution: item.resolution,
      hammerVerified: verifiedKeys.has(item.key),
      approvalBlocked: Boolean(
        item.approveDisabledReason || failures[item.key]?.intent === "approve",
      ),
    });
  }

  function activatePrimaryAction(item: ReferenceReviewItem) {
    if (item.family === "reference_clip") {
      if (!item.sourceSummary.length) openDrawer(item, "replace");
      else if (item.candidate) void approve(item);
      else openDrawer(item, "replace");
      return;
    }
    const action = visualPrimaryAction(item);
    if (!action || action.target === "none") return;
    if (action.target === "reference_visual_workflow")
      openReferenceVisualWorkflow(item);
    else if (action.target === "approval") void approve(item);
  }
  if (visualWorkflowFocus) {
    return (
      <section
        className="hs-reference-material hs-reference-review is-workspace-mode"
        aria-label="Reference Visual workspace"
        data-presentation-mode="workspace"
      >
        <CanonicalReferenceVisualPanel
          workspaceId={workspaceId}
          workpieceId={workpieceId}
          focus={visualWorkflowFocus}
          onClose={closeReferenceVisualWorkflow}
        />
      </section>
    );
  }
  return (
    <section
      className="hs-reference-material hs-reference-review"
      aria-label="Reference Material"
    >
      <header className="hs-reference-material-header">
        <div>
          <h3>Reference Material</h3>
          <p>
            Review the real clips and source-backed visuals Hearth proposes for
            your episode.
          </p>
        </div>
        <span className="hs-pill">
          {items.filter((item) => item.state === "ready").length} of{" "}
          {items.length} ready
        </span>
      </header>
      {loading ? <p aria-live="polite">Hearth is working</p> : null}
      {loadError ? (
        <p role="alert" className="hs-error-text-small">
          {loadError}
        </p>
      ) : null}
      {!loading && !items.length ? (
        <div className="hs-reference-review-empty">
          No Reference Material was proposed for this Visual Plan.
        </div>
      ) : null}
      <div className="hs-reference-review-queue">
        {items.map((item) => {
          const failed = failures[item.key];
          const visualAction = visualPrimaryAction(item);
          const primaryLabel =
            visualAction?.label ??
            (item.sourceSummary.length
              ? item.candidate
                ? "Approve"
                : "Replace"
              : "Add Source");
          return (
            <article
              key={item.key}
              id={`${item.key}-card`}
              tabIndex={-1}
              className={`hs-reference-review-card is-${item.state}`}
              aria-labelledby={`${item.key}-title`}
            >
              <div className="hs-reference-review-preview">
                {item.previewUrl ? (
                  item.family === "reference_clip" ? (
                    <video
                      src={item.previewUrl}
                      poster={item.candidate?.posterUrl ?? undefined}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <img src={item.previewUrl} alt={item.proposal} />
                  )
                ) : (
                  <div className="hs-reference-review-placeholder">
                    Preview{" "}
                    {item.state === "hearth_is_working"
                      ? "is being prepared"
                      : "not available yet"}
                  </div>
                )}
              </div>
              <div className="hs-reference-review-copy">
                <div className="hs-reference-review-heading">
                  <span className="hs-pill">{item.label}</span>
                  <span
                    className={`hs-reference-review-status is-${item.state}`}
                    aria-live="polite"
                  >
                    {statusLabel(item.state)}
                  </span>
                  {item.resolution === "skipped" ? (
                    <span className="hs-pill">Skipped</span>
                  ) : null}
                </div>
                <blockquote id={`${item.key}-title`}>
                  {item.anchor.focus}
                </blockquote>
                <strong>{item.proposal}</strong>
                <p>{item.rationale}</p>
                <p>
                  <small>
                    Source:{" "}
                    {item.sourceSummary.length
                      ? item.sourceSummary.join(" · ")
                      : "No canonical Source linked"}
                  </small>
                </p>
                {item.sourceUrl ? (
                  <p>
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      Open linked Source
                    </a>
                  </p>
                ) : null}
                {!item.sourceSummary.length ? (
                  <p className="hs-reference-review-warning">
                    This is an unsourced planning suggestion, not episode
                    Reference Material. It will not block completion unless you
                    attach a canonical Source.
                  </p>
                ) : null}
                {item.warning ? (
                  <p className="hs-reference-review-warning">{item.warning}</p>
                ) : null}
                {failed ? (
                  <p role="alert" className="hs-error-text-small">
                    {failed.message}{" "}
                    <button type="button" onClick={() => void retry(item)}>
                      Retry
                    </button>
                  </p>
                ) : null}
                <div className="hs-reference-review-actions">
                  <button
                    type="button"
                    className="hs-primary-btn"
                    disabled={
                      item.state === "hearth_is_working" ||
                      Boolean(visualAction?.disabled) ||
                      (visualAction?.action === "approve" &&
                        !!item.approveDisabledReason)
                    }
                    title={
                      item.family === "reference_visual"
                        ? visualAction?.workflow.nextActionDetail
                        : item.candidate
                          ? (item.approveDisabledReason ?? undefined)
                          : item.sourceSummary.length
                            ? "Continue preparing this Reference Material."
                            : "Attach a canonical Source to make this Reference Material."
                    }
                    onClick={() => activatePrimaryAction(item)}
                  >
                    {primaryLabel}
                  </button>
                  {item.family === "reference_clip" ? (
                    <>
                      <button
                        type="button"
                        disabled={item.state === "hearth_is_working"}
                        onClick={() => openDrawer(item, "edit")}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={item.state === "hearth_is_working"}
                        onClick={() => openDrawer(item, "replace")}
                      >
                        Replace
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={item.state === "hearth_is_working"}
                    onClick={() => openDrawer(item, "skip")}
                  >
                    Skip
                  </button>
                </div>
                <details>
                  <summary>Details</summary>
                  <dl>
                    <div>
                      <dt>Placement</dt>
                      <dd>{item.placement || "At the anchored passage"}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>
                        {Math.max(1, Math.round(item.durationMs / 1000))}{" "}
                        seconds
                      </dd>
                    </div>
                  </dl>
                  <pre>{JSON.stringify(item.details, null, 2)}</pre>
                </details>
              </div>
            </article>
          );
        })}
      </div>
      {activeDrawer ? (
        <div
          className="hs-reference-review-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawer(null);
          }}
        >
          <aside
            className="hs-reference-review-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reference-review-drawer-title"
          >
            <header>
              <div>
                <span className="hs-pill">{activeDrawer.label}</span>
                <h4 id="reference-review-drawer-title">
                  {drawer?.mode === "edit"
                    ? "Edit editorial details"
                    : drawer?.mode === "replace"
                      ? "Replace the material"
                      : "Skip this proposal"}
                </h4>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDrawer(null)}
              >
                ×
              </button>
            </header>
            {drawer?.mode === "edit" ? (
              <>
                <p className="hs-reference-review-help">
                  Reference Clip timing is edited while choosing or preparing
                  its material. Use Replace to keep the script anchor and
                  prepare that revised clip.
                </p>
              </>
            ) : drawer?.mode === "replace" ? (
              <>
                <p>
                  Change the material itself by adding a URL or choosing another
                  prepared candidate. Existing decisions elsewhere are
                  preserved.
                </p>
                <label>
                  Source URL
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <p className="hs-reference-review-help">
                  Use this source inspects and analyzes the URL. AI-assisted
                  analysis may consume credits when your saved preference or
                  explicit confirmation allows it; deterministic retrieval
                  remains available without AI.
                </p>
                <button
                  type="button"
                  className="hs-primary-btn"
                  disabled={
                    !sourceUrl.trim() || pendingKeys.has(activeDrawer.key)
                  }
                  onClick={() => void useSource(activeDrawer)}
                >
                  Use this source
                </button>
              </>
            ) : (
              <>
                <label>
                  Why skip?
                  <select
                    value={skipReason}
                    onChange={(event) =>
                      setSkipReason(event.target.value as VisualSkipReason)
                    }
                  >
                    <option value="editorially_unneeded">
                      Not needed editorially
                    </option>
                    <option value="rights_unavailable">
                      Rights unavailable
                    </option>
                    <option value="material_unobtainable">
                      Material unavailable
                    </option>
                    <option value="duplicate_coverage">
                      Duplicate coverage
                    </option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Note (optional)
                  <textarea
                    value={skipNote}
                    onChange={(event) => setSkipNote(event.target.value)}
                    rows={3}
                  />
                </label>
                <button type="button" onClick={() => void skip(activeDrawer)}>
                  Skip this proposal
                </button>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
