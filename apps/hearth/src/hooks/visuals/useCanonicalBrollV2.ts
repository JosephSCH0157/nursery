import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildBrollPlanFromScript } from "../../lib/hearth-broll-plan";
import { tongsFetch } from "../../lib/tongs-fetch";
import {
  acquireCanonicalBroll,
  commitCanonicalBrollPlan,
  editCanonicalBrollPrompt,
  generateCanonicalBrollPrompt,
  generateCanonicalBrollVideo,
  proposeRunwayReadyBrollPrompt,
  readCanonicalBrollV2,
  resumeCanonicalBrollVideo,
  selectCanonicalBrollCandidate,
  type CanonicalBrollV2State,
} from "../../lib/hearth-broll-v2-authority";

const EMPTY: CanonicalBrollV2State = { plan: null, planRevisionId: null, planRevision: 0, selectionRevision: 0, scriptApprovalId: null, promptsByBeat: {} };

function exactAnchor(script: string, span: string, ordinal: number) {
  const charStart = Math.max(0, script.indexOf(span));
  return {
    state: "current", reason: null,
    exact_anchor: { section_id: "approved-script", paragraph_id: `approved-script-${ordinal + 1}`, paragraph_order: ordinal + 1, sentence_start: 1, sentence_end: 1, char_start: charStart, char_end: charStart + span.length, span_text: span },
    evidence: { assessed_contract_version: "forge.broll-source-context.v1", match_count: script.split(span).length - 1 },
  };
}

export function useCanonicalBrollV2(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  plannedMoments?: Array<{ id: string; anchorText: string; description: string; placementHint: string | null }>;
}) {
  const [state, setState] = useState<CanonicalBrollV2State>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeOperation, setActiveOperation] = useState<"motion_prompt" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const resumedOperations = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!args.workspaceId || !args.workpieceId) { setState(EMPTY); return false; }
    setLoading(true);
    const result = await readCanonicalBrollV2({ workspaceId: args.workspaceId, workpieceId: args.workpieceId });
    setLoading(false);
    if (!result.ok) { setError(result.error); return false; }
    setState(result.data); setError(null); return true;
  }, [args.workspaceId, args.workpieceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!args.workspaceId || !args.workpieceId || loading || busy || !state.plan) return;
    const beats = state.plan.beats.filter((item) => !item.selected_asset_id && (item.candidate_assets?.length ?? 0) === 0 && state.promptsByBeat[item.id]?.revisionId && !resumedOperations.current.has(item.id));
    if (!beats.length) return;
    for (const beat of beats) resumedOperations.current.add(beat.id);
    void (async () => {
      setBusy(true); setActiveOperation("video"); setMessage("Checking for an existing Runway generation…");
      try {
        for (const beat of beats) {
          const resumed = await resumeCanonicalBrollVideo({ workspaceId: args.workspaceId!, workpieceId: args.workpieceId!, beatId: beat.id, prompt: state.promptsByBeat[beat.id] });
          if (!resumed.ok) { setError(resumed.error); return; }
          if (!resumed.data) continue;
          setState(resumed.data); setError(null); setMessage("Existing Runway generation recovered. Video and poster are ready to preview."); return;
        }
        setMessage(null);
      } finally { setBusy(false); setActiveOperation(null); }
    })();
  }, [args.workspaceId, args.workpieceId, busy, loading, state]);

  const generatePlan = useCallback(async (readApprovedScript: () => Promise<{ ok: true; text: string } | { ok: false; message: string }>) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const script = await readApprovedScript();
      if (!script.ok) { setError(script.message); return; }
      const approvalResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-approval`, { method: "GET" });
      const approvalBody = await approvalResponse.json().catch(() => null) as { data?: { current_approval?: { id?: string } } } | null;
      const approvalId = approvalBody?.data?.current_approval?.id ?? null;
      if (!approvalResponse.ok || !approvalId) { setError("The current immutable approved-script revision could not be read."); return; }
      const fallback = buildBrollPlanFromScript({ workpieceId: args.workpieceId, scriptText: script.text, previousPlan: state.plan });
      const seeds = args.plannedMoments?.length ? args.plannedMoments.map((moment) => ({
        anchor_text: moment.anchorText,
        description: moment.description,
        placement_hint: moment.placementHint ?? "first_occurrence",
        suggested_duration_ms: 4000,
        shot_type: "mixed",
        motion_intent: "broll",
        mood: "neutral",
        asset_category: "uploaded_video",
      })) : fallback.beats;
      const beats = seeds.map((beat, index) => ({
        beat_id: state.plan?.beats[index]?.id ?? crypto.randomUUID(),
        context_before: index > 0 ? seeds[index - 1]?.anchor_text ?? "" : "",
        context_focus: beat.anchor_text,
        context_after: seeds[index + 1]?.anchor_text ?? "",
        canonical_anchor_assessment: exactAnchor(script.text, beat.anchor_text, index),
        narrative_purpose: beat.description,
        placement_hint: beat.placement_hint,
        duration_target_ms: beat.suggested_duration_ms ?? 4000,
        shot_type: beat.shot_type,
        motion_intent: beat.motion_intent,
        mood_pacing: beat.mood ?? "neutral",
        asset_category: beat.asset_category,
        trim_guidance: { preserve_full_action: true },
      }));
      const committed = await commitCanonicalBrollPlan({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, scriptApprovalId: approvalId, current: state, beats });
      if (!committed.ok) { setError(committed.error); return; }
      setState(committed.data); setMessage(`Canonical B-roll plan ready with ${committed.data.plan?.beats.length ?? 0} beats.`);
    } finally { setBusy(false); }
  }, [args.workspaceId, args.workpieceId, args.plannedMoments, busy, state]);

  const upload = useCallback(async (beatId: string, file: File) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const acquired = await acquireCanonicalBroll({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, sourceKind: "upload", file });
      if (!acquired.ok) { setError(acquired.error); setMessage(null); return; }
      setState(acquired.data); setMessage("Video and poster verified. Candidate is ready to preview.");
    } finally { setBusy(false); }
  }, [args.workspaceId, args.workpieceId, busy]);

  const attachExternal = useCallback(async (beatId: string, sourceUrl: string) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const acquired = await acquireCanonicalBroll({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, sourceKind: "external", sourceUrl });
      if (!acquired.ok) { setError(acquired.error); return; }
      setState(acquired.data); setMessage("External video fetched, verified, and stored canonically.");
    } finally { setBusy(false); }
  }, [args.workspaceId, args.workpieceId, busy]);

  const generateVideo = useCallback(async (beatId: string) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setActiveOperation("video"); setError(null); setMessage("Runway generation is active. Waiting for the durable task result…");
    try {
      const quote = await generateCanonicalBrollVideo({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, prompt: state.promptsByBeat[beatId], confirmSpend: false });
      if (quote.ok) { setState(quote.data); setMessage("Existing Runway generation recovered. Video and poster are ready to preview."); return; }
      if (!quote.requiresConfirmation) { setError(quote.error); setMessage(null); return; }
      const confirmed = window.confirm(quote.authorizationMessage ?? `Generate this Runway video? Up to ${(quote.authorizedCustomerCeiling ?? 0).toLocaleString()} AI credits will be held.`);
      if (!confirmed) { setMessage(null); return; }
      const acquired = await generateCanonicalBrollVideo({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, prompt: state.promptsByBeat[beatId], confirmSpend: true });
      if (!acquired.ok) { setError(acquired.error); setMessage(null); return; }
      setState(acquired.data); setMessage("Runway video and poster verified. Candidate is ready to preview.");
    } finally { setBusy(false); setActiveOperation(null); }
  }, [args.workspaceId, args.workpieceId, busy, state.promptsByBeat]);

  const select = useCallback(async (beatId: string, candidateRevisionId: string) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const selected = await selectCanonicalBrollCandidate({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, candidateRevisionId, current: state });
      if (!selected.ok) { setError(selected.error); return; }
      setState(selected.data); setMessage("Clip selected canonically for this beat.");
    } finally { setBusy(false); }
  }, [args.workspaceId, args.workpieceId, busy, state]);

  const generatePrompt = useCallback(async (beatId: string, creatorDirection: string) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setActiveOperation("motion_prompt"); setError(null); setMessage("Creating the canonical motion brief and prompt… Keep this page open.");
    try {
      const generated = await generateCanonicalBrollPrompt({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, creatorDirection, current: state.promptsByBeat[beatId] ?? { status: "missing", revisionId: null, revision: 0, contentHash: null, creatorDirection: "", finalPrompt: null, motionBrief: null, mismatchReasons: [] } });
      if (!generated.ok) { setError(generated.error); return; }
      setState(generated.data); setMessage("Canonical motion brief and prompt are ready.");
    } finally { setBusy(false); setActiveOperation(null); }
  }, [args.workspaceId, args.workpieceId, busy, state.promptsByBeat]);

  const editPrompt = useCallback(async (beatId: string, finalPrompt: string) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const edited = await editCanonicalBrollPrompt({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, finalPrompt, current: state.promptsByBeat[beatId] });
      if (!edited.ok) { setError(edited.error); return; }
      setState(edited.data); setMessage("Creator motion-prompt edit saved as a new canonical revision.");
    } finally { setBusy(false); }
  }, [args.workspaceId, args.workpieceId, busy, state.promptsByBeat]);

  const proposeRunwayPrompt = useCallback(async (beatId:string) => {
    if(!args.workspaceId||!args.workpieceId||busy)return null;
    setBusy(true);setError(null);setMessage(null);
    try{const proposed=await proposeRunwayReadyBrollPrompt({workspaceId:args.workspaceId,workpieceId:args.workpieceId,beatId,current:state.promptsByBeat[beatId]});if(!proposed.ok){setError(proposed.error);return null;}setMessage(`Runway-ready proposal created (${proposed.data.lengthUtf16} UTF-16 code units). Confirm it to append a canonical revision.`);return proposed.data;}finally{setBusy(false);}
  },[args.workspaceId,args.workpieceId,busy,state.promptsByBeat]);

  const progress = useMemo(() => ({ ready: state.plan?.beats.filter((beat) => beat.fulfillment_state === "resolved").length ?? 0, total: state.plan?.beats.length ?? 0 }), [state.plan]);
  return { state, loading, busy, activeOperation, error, message, progress, refresh, generatePlan, generatePrompt, editPrompt, proposeRunwayPrompt, generateVideo, upload, attachExternal, select };
}
