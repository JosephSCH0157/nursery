import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addReferenceClip,
  createAndFulfillReferenceClipSource,
  readCanonicalReferenceClips,
  verifyReferenceClipHammerReadback,
  type ReferenceClipState,
} from "../../lib/hearth-reference-clip-authority";
import { createCanonicalWorkpieceSource } from "../../lib/hearth-reference-clip-authority";
import {
  addReferenceVisualSource,
  ingestReferenceVisualSource,
  readCanonicalReferenceVisualCollections,
} from "../../lib/hearth-reference-visual-collections";
import {
  acquireReferenceVisual,
  commitReferenceVisualRecipe,
  commitReferenceVisualRights,
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
  projectReferenceMaterialVisualAction,
  type ReferenceVisualWorkflowFocus,
} from "../../lib/hearth-reference-material-workflow";
import { subscribeToForgeUserAccessToken } from "../../lib/tongs-fetch";
import CanonicalReferenceVisualPanel from "./CanonicalReferenceVisualPanel";

type DrawerMode = "edit" | "replace" | "prepare" | "skip";
type EditDraft = {
  title: string;
  subtitle: string;
  attribution: string;
  accessibility: string;
};
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
    [rightsStatus, setRightsStatus] = useState("rights_unresolved"),
    [rightsAttribution, setRightsAttribution] = useState(""),
    [rightsAcknowledged, setRightsAcknowledged] = useState(false),
    [rightsSaved, setRightsSaved] = useState(false),
    [rightsMessage, setRightsMessage] = useState<string | null>(null),
    [acquisitionError, setAcquisitionError] = useState<string | null>(null),
    [visualWorkflowFocus, setVisualWorkflowFocus] =
      useState<ReferenceVisualWorkflowFocus | null>(null),
    [editDraft, setEditDraft] = useState<EditDraft>({
      title: "",
      subtitle: "",
      attribution: "",
      accessibility: "",
    }),
    [skipReason, setSkipReason] = useState<VisualSkipReason>(
      "editorially_unneeded",
    ),
    [skipNote, setSkipNote] = useState("");
  const alive = useRef(true),
    refreshSequence = useRef(0),
    attempts = useRef(new Map<string, string>()),
    retryParents = useRef(new Map<string, string>());
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
    if (failureResult.ok) {
      const persisted: Record<string, Failure> = {};
      retryParents.current.clear();
      for (const failure of failureResult.data) {
        persisted[failure.key] = {
          intent: failure.intent,
          message: failure.message,
        };
        retryParents.current.set(failure.key, failure.attemptId);
      }
      setFailures(persisted);
    }
    if (clipResult.ok && visualResult.ok && dispositionResult.ok) {
      const projected = projectReferenceReviewItems({
          clips: clipResult.data,
          visuals: visualResult.data,
          dispositions: dispositionResult.data,
        }),
        resolved = projected.filter((item) => item.resolution !== null),
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
      : null,
    activeVisualOpportunity = activeDrawer?.family === "reference_visual"
      ? visuals?.opportunities.find((entry) => entry.id === activeDrawer.opportunityId) ?? null
      : null;
  function openDrawer(item: ReferenceReviewItem, mode: DrawerMode) {
    if (mode === "edit" && item.family === "reference_visual") {
      const opportunity = visuals?.opportunities.find(
        (entry) => entry.id === item.opportunityId,
      );
      setEditDraft({
        title: String(opportunity?.recipe?.title ?? item.proposal),
        subtitle: String(opportunity?.recipe?.subtitle ?? ""),
        attribution: String(opportunity?.recipe?.attribution_text ?? ""),
        accessibility: String(
          opportunity?.recipe?.accessibility_text ?? item.proposal,
        ),
      });
    }
    if (mode === "prepare") {
      const opportunity = item.family === "reference_visual"
        ? visuals?.opportunities.find((entry) => entry.id === item.opportunityId)
        : null;
      const rights = opportunity?.rights;
      setSourceUrl(item.sourceUrl ?? "");
      setRightsStatus(typeof rights?.rights_status === "string" ? rights.rights_status : "rights_unresolved");
      setRightsAttribution(typeof rights?.attribution_text === "string" ? rights.attribution_text : "");
      setRightsAcknowledged(rights?.creator_acknowledged_responsibility === true);
      setRightsSaved(Boolean(rights));
      setRightsMessage(rights ? "Rights saved" : null);
      setAcquisitionError(null);
    }
    setDrawer({ key: item.key, mode });
  }

  function rightsDraftMatches(opportunity: NonNullable<typeof activeVisualOpportunity>) {
    const rights = opportunity.rights;
    if (!rights) return false;
    const attribution = rightsAttribution.trim();
    return rights.rights_status === rightsStatus
      && rights.creator_acknowledged_responsibility === rightsAcknowledged
      && rights.attribution_required === Boolean(attribution)
      && String(rights.attribution_text ?? "") === attribution;
  }

  async function saveLinkedVisualRights(item: ReferenceReviewItem) {
    if (item.family !== "reference_visual" || !visuals) return;
    const opportunity = visuals.opportunities.find((entry) => entry.id === item.opportunityId);
    if (!opportunity) return;
    setAcquisitionError(null);
    if (rightsDraftMatches(opportunity)) {
      setRightsSaved(true);
      setRightsMessage("Rights saved");
      setDrawer(null);
      return;
    }
    if (!opportunity || !(await begin(item, "replace"))) return;
    const rights = await commitReferenceVisualRights({
      workspaceId,
      workpieceId,
      opportunity,
      status: rightsStatus,
      declaration: {
        creator_acknowledged_responsibility: rightsAcknowledged,
        rights_holder: null,
        attribution_required: Boolean(rightsAttribution.trim()),
        attribution_text: rightsAttribution.trim() || null,
        fair_use_rationale: null,
        permission_evidence: {},
        platform_terms: {},
        territories: [],
        provenance: { entered_in: "hearth_reference_material" },
        access_controls_bypassed: false,
      },
    });
    if (!rights.ok) {
      setRightsMessage(null);
      fail(item, "replace", rights.error);
      return;
    }
    const withRights = await readCanonicalReferenceVisualCollections(workspaceId, workpieceId);
    const current = withRights.ok ? withRights.data?.opportunities.find((entry) => entry.id === item.opportunityId) : null;
    if (!withRights.ok || !current?.rights || !rightsDraftMatches(current)) {
      setRightsMessage(null);
      fail(item, "replace", withRights.ok ? "The rights declaration did not match canonical readback." : withRights.error);
      return;
    }
    if (!(await succeed(item, "replace", {
      rights_saved: true,
      rights_declaration_revision_id: String(current.rights.id ?? ""),
      canonical_candidate_created: false,
    }))) return;
    setVisuals(withRights.data);
    setRightsSaved(true);
    setRightsMessage("Rights saved");
    setDrawer(null);
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
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".hs-reference-visuals")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function closeReferenceVisualWorkflow() {
    const returnCardKey = visualWorkflowFocus?.returnCardKey;
    setVisualWorkflowFocus(null);
    void refresh();
    if (returnCardKey)
      requestAnimationFrame(() =>
        document
          .getElementById(`${returnCardKey}-card`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
  }

  async function acquireLinkedVisual(item: ReferenceReviewItem) {
    if (item.family !== "reference_visual" || !sourceUrl.trim()) return;
    setAcquisitionError(null);
    const readback = await readCanonicalReferenceVisualCollections(workspaceId, workpieceId);
    const current = readback.ok
      ? readback.data?.opportunities.find((entry) => entry.id === item.opportunityId)
      : null;
    if (!readback.ok || !current) {
      setAcquisitionError(readback.ok ? "This Reference Visual opportunity is no longer current." : readback.error);
      return;
    }
    setVisuals(readback.data);
    if (!current.rights) {
      setRightsSaved(false);
      setRightsMessage(null);
      setAcquisitionError("Save rights before acquiring archival material.");
      return;
    }
    if (current.subtype !== "archival_still" && current.subtype !== "archival_sequence") {
      setAcquisitionError(`This ${current.subtype.replaceAll("_", " ")} uses the Reference Visual design workflow; rights remain saved and no archival image was acquired.`);
      return;
    }
    if (!current.sourceSetRevisionId || !(current.sources?.length)) {
      setAcquisitionError("The current Source collection is unavailable. Rights remain saved.");
      return;
    }
    if (!(await begin(item, "replace"))) return;
    const acquired = await acquireReferenceVisual({
      workspaceId,
      workpieceId,
      opportunity: current,
      type: "external_fetch",
      sourceUrl: sourceUrl.trim(),
    });
    if (!acquired.ok) {
      setAcquisitionError(acquired.error);
      fail(item, "replace", acquired.error);
      return;
    }
    if (!(await succeed(item, "replace", {
      canonical_candidate_created: true,
      rights_declaration_revision_id: String(current.rights.id ?? ""),
      source_set_revision_id: current.sourceSetRevisionId,
    }))) return;
    setDrawer(null);
    await refresh();
  }
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
    if (!url || !(await begin(item, "use_source"))) return;
    if (item.family === "reference_visual") {
      if (!visuals) {
        fail(item, "use_source", "Reference Visuals are not available.");
        return;
      }
      const opportunity = visuals.opportunities.find(
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
      const inspected = await ingestReferenceVisualSource({
        workspaceId,
        workpieceId,
        url,
        contextFocus: opportunity.focus,
        editorialReason: opportunity.editorialReason,
        desiredMaterial: opportunity.desiredMaterial,
      });
      if (!inspected.ok) {
        fail(item, "use_source", inspected.error);
        return;
      }
      const proposal = inspected.data,
        created = await createCanonicalWorkpieceSource({
          workspaceId,
          workpieceId,
          draft: {
            sourceType: "web",
            title: proposal.title ?? hostTitle(url),
            author: proposal.author ?? "",
            publisher: proposal.publisher ?? "",
            publishedAt: proposal.publishedAt ?? "",
            canonicalUrl: proposal.canonicalUrl,
            documentIdentity: `url:${proposal.canonicalUrl}`,
            relationshipType: "reference_visual_evidence",
            relationshipNote: proposal.suggestedUse,
            citation: {
              span_text: opportunity.focus,
              before: opportunity.before,
              after: opportunity.after,
            },
            mediaRange: {},
            provenanceContext: {
              reference_visual_opportunity_id: opportunity.id,
              retrieved_at: proposal.retrievedAt,
              source_ingestion: "deterministic_or_creator_authorized",
            },
          },
        });
      if (!created.ok) {
        fail(item, "use_source", created.error);
        return;
      }
      const linked = await addReferenceVisualSource({
        workspaceId,
        workpieceId,
        state: visuals,
        opportunityId: opportunity.id,
        source: created.data,
      });
      if (!linked.ok) {
        fail(item, "use_source", linked.error);
        return;
      }
      setVisuals(linked.data);
    } else {
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
    }
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
  async function saveEdits(item: ReferenceReviewItem) {
    if (item.family !== "reference_visual" || !visuals) {
      setFailures((current) => ({
        ...current,
        [item.key]: {
          intent: "save_edits",
          message:
            "Reference Clip timecode editing requires its native amendment contract.",
        },
      }));
      return;
    }
    const opportunity = visuals.opportunities.find(
      (entry) => entry.id === item.opportunityId,
    );
    if (
      !opportunity ||
      !editDraft.title.trim() ||
      !(await begin(item, "save_edits"))
    )
      return;
    const saved = await commitReferenceVisualRecipe({
      workspaceId,
      workpieceId,
      opportunity,
      title: editDraft.title.trim(),
      subtitle: editDraft.subtitle.trim(),
      attribution: editDraft.attribution.trim(),
      accessibility: editDraft.accessibility.trim(),
    });
    if (!saved.ok) {
      fail(item, "save_edits", saved.error);
      return;
    }
    const readback = await readCanonicalReferenceVisualCollections(
      workspaceId,
      workpieceId,
    );
    const updated = readback.ok
      ? readback.data?.opportunities.find(
          (entry) => entry.id === item.opportunityId,
        )
      : null;
    if (
      !readback.ok ||
      !updated?.recipe ||
      String(updated.recipe.title ?? "") !== editDraft.title.trim()
    ) {
      fail(
        item,
        "save_edits",
        readback.ok
          ? "The saved edit did not match canonical readback."
          : readback.error,
      );
      return;
    }
    if (
      !(await succeed(item, "save_edits", {
        proposal_updated: true,
        native_recipe_revision_id: String(updated.recipe.id ?? ""),
      }))
    )
      return;
    setVisuals(readback.data);
    setDrawer(null);
    await refresh();
  }
  async function retry(item: ReferenceReviewItem) {
    const failure = failures[item.key];
    if (!failure) return;
      if (failure.intent === "approve") await approve(item);
      else if (failure.intent === "skip") await skip(item);
      else if (failure.intent === "use_source") await useSource(item);
      else if (failure.intent === "save_edits") await saveEdits(item);
      else if (item.family === "reference_visual") activatePrimaryAction(item);
      else openDrawer(item, "replace");
  }

  function visualPrimaryAction(item: ReferenceReviewItem) {
    if (item.family !== "reference_visual") return null;
    const opportunity = visuals?.opportunities.find(
      (entry) => entry.id === item.opportunityId,
    );
    if (!opportunity) return null;
    return projectReferenceMaterialVisualAction({
      sourceLinked:
        opportunity.sourceStatus === "linked" &&
        Boolean(opportunity.sources?.length),
      rightsSaved: Boolean(opportunity.rights),
      subtype: opportunity.subtype,
      candidateReady: Boolean(item.candidate),
      resolution: item.resolution,
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
    if (action.target === "source_drawer") openDrawer(item, "replace");
    else if (
      action.target === "rights_drawer" ||
      action.target === "acquisition_drawer"
    )
      openDrawer(item, "prepare");
    else if (action.target === "reference_visual_workflow")
      openReferenceVisualWorkflow(item);
    else if (action.target === "approval") void approve(item);
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
          const primaryLabel = visualAction?.label ??
            (item.sourceSummary.length
              ? item.candidate
                ? "Approve"
                : "Replace"
              : "Add Source");
          return (
            <article
              key={item.key}
              id={`${item.key}-card`}
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
                {item.sourceUrl ? <p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Open linked Source</a></p> : null}
                {!item.sourceSummary.length ? (
                  <p className="hs-reference-review-warning">
                    This is an unsourced planning suggestion, not episode Reference Material. It will not block completion unless you attach a canonical Source.
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
                      (Boolean(item.candidate) && !!item.approveDisabledReason)
                    }
                    title={
                      item.candidate
                        ? item.approveDisabledReason ?? undefined
                        : visualAction?.action === "review_rights"
                          ? "Review and save the rights declaration for this Source."
                          : visualAction?.action === "acquire_image"
                            ? "Acquire archival material using the saved rights declaration."
                            : visualAction?.action === "design_visual"
                              ? "Continue the exact opportunity in the canonical Reference Visual workflow."
                              : item.sourceSummary.length
                                ? "Continue preparing this Reference Material."
                                : "Attach a canonical Source to make this Reference Material."
                    }
                    onClick={() => activatePrimaryAction(item)}
                  >
                    {primaryLabel}
                  </button>
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
      {visualWorkflowFocus ? (
        <CanonicalReferenceVisualPanel
          workspaceId={workspaceId}
          workpieceId={workpieceId}
          focus={visualWorkflowFocus}
          onClose={closeReferenceVisualWorkflow}
        />
      ) : null}
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
                      : drawer?.mode === "prepare"
                        ? activeVisualOpportunity?.rights
                          ? "Acquire archival image"
                          : "Review rights"
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
                <p>
                  Keep the proposed material and Sources. Review timing,
                  evidence interpretation, intended use, crop, and render
                  details below.
                </p>
                {activeDrawer.family === "reference_visual" ? (
                  <>
                    <label>
                      Headline
                      <input
                        value={editDraft.title}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Supporting line
                      <textarea
                        value={editDraft.subtitle}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            subtitle: event.target.value,
                          }))
                        }
                        rows={3}
                      />
                    </label>
                    <label>
                      Visible attribution
                      <input
                        value={editDraft.attribution}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            attribution: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Accessibility description
                      <textarea
                        value={editDraft.accessibility}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            accessibility: event.target.value,
                          }))
                        }
                        rows={3}
                      />
                    </label>
                    <button
                      type="button"
                      className="hs-primary-btn"
                      disabled={
                        !editDraft.title.trim() ||
                        pendingKeys.has(activeDrawer.key)
                      }
                      onClick={() => void saveEdits(activeDrawer)}
                    >
                      Save edits
                    </button>
                  </>
                ) : (
                  <p className="hs-reference-review-help">
                    Reference Clip timing is edited while choosing or preparing
                    its material. Use Replace to keep the script anchor and
                    prepare that revised clip.
                  </p>
                )}
                <p className="hs-reference-review-help">
                  A new immutable render can remain an edit. Saving edits never
                  approves the proposal.
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
            ) : drawer?.mode === "prepare" ? (
              <>
                <p>{activeVisualOpportunity?.rights ? "The current rights declaration is saved. Review it below before choosing the separate archival acquisition action." : "The Source is linked. Save the rights declaration first. Hearth will not copy or acquire an image from this action."}</p>
                <p><a href={sourceUrl} target="_blank" rel="noreferrer">Open linked image</a></p>
                <label>
                  Rights status
                  <select value={rightsStatus} onChange={(event) => { setRightsStatus(event.target.value); setRightsSaved(false); setRightsMessage(null); }}>
                    <option value="rights_unresolved">Rights unresolved</option>
                    <option value="creator_owned">Creator-owned</option>
                    <option value="licensed">Licensed</option>
                    <option value="public_domain">Public domain</option>
                    <option value="permission_obtained">Permission obtained</option>
                    <option value="platform_permitted">Platform-permitted</option>
                    <option value="fair_use_asserted_by_creator">Fair use asserted by creator</option>
                  </select>
                </label>
                <label>Attribution text (if required)<input value={rightsAttribution} onChange={(event) => { setRightsAttribution(event.target.value); setRightsSaved(false); setRightsMessage(null); }} /></label>
                <label className="hs-reference-visual-check"><input type="checkbox" checked={rightsAcknowledged} onChange={(event) => { setRightsAcknowledged(event.target.checked); setRightsSaved(false); setRightsMessage(null); }} /> I confirm that I am responsible for rights and permissions and did not bypass access controls.</label>
                <button type="button" className="hs-primary-btn" disabled={!rightsAcknowledged || rightsStatus === "rights_unresolved" || pendingKeys.has(activeDrawer.key)} onClick={() => void saveLinkedVisualRights(activeDrawer)}>Save rights</button>
                {rightsMessage ? <p role="status">{rightsMessage}</p> : null}
                {rightsSaved && (activeVisualOpportunity?.subtype === "archival_still" || activeVisualOpportunity?.subtype === "archival_sequence") ? (
                  <button type="button" disabled={pendingKeys.has(activeDrawer.key)} onClick={() => void acquireLinkedVisual(activeDrawer)}>Acquire image</button>
                ) : rightsSaved ? (
                  <p className="hs-reference-review-help">Rights are saved. This {activeVisualOpportunity?.subtype.replaceAll("_", " ") ?? "Reference Visual"} continues through the Reference Visual design workflow; no archival acquisition is available here.</p>
                ) : null}
                {acquisitionError ? <p role="alert" className="hs-error-text-small">Acquisition failed: {acquisitionError}</p> : null}
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
