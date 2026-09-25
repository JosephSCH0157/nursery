import { useCallback, useEffect, useMemo, useState } from "react";
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
  selectCanonicalBrollCandidate,
  startReplacementRunwayGenerationAttempt,
  type CanonicalBrollV2State,
  type CustomerMotionPromptSpendingQuote,
  type CustomerRunwayGenerationAttempt,
  type CustomerRunwaySpendingQuote,
  type CustomerRunwaySpendingReceipt,
  type CustomerRunwayTerminalAttempt,
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
  const [motionPromptError, setMotionPromptError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [motionPromptQuote, setMotionPromptQuote] = useState<CustomerMotionPromptSpendingQuote | null>(null);
  const [pendingMotionPrompt, setPendingMotionPrompt] = useState<{ beatId: string; creatorDirection: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [spendingQuote, setSpendingQuote] = useState<CustomerRunwaySpendingQuote | null>(null);
  const [spendingReceipt, setSpendingReceipt] = useState<CustomerRunwaySpendingReceipt | null>(null);
  const [terminalGenerationAttempt, setTerminalGenerationAttempt] = useState<CustomerRunwayTerminalAttempt | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<{
    beatId: string;
    referenceImages: Array<{ file: File; stageLabel?: string }>;
  } | null>(null);
  const [pendingGeneration, setPendingGeneration] = useState<{
    beatId: string;
    referenceImages: Array<{ file: File; stageLabel?: string }>;
    generationAttempt: CustomerRunwayGenerationAttempt | null;
  } | null>(null);

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
    setMotionPromptQuote(null);
    setPendingMotionPrompt(null);
    setVideoError(null);
    setSpendingQuote(null);
    setTerminalGenerationAttempt(null);
    setPendingReplacement(null);
    setPendingGeneration(null);
  }, [args.workspaceId, args.workpieceId]);

  useEffect(() => {
    if (activeOperation === null && message?.startsWith("Creating the canonical motion brief")) {
      setMessage(null);
    }
  }, [activeOperation, message]);

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

  const generateVideo = useCallback(async (beatId: string, referenceImages: Array<{ file: File; stageLabel?: string }> = []) => {
    if (!args.workspaceId || !args.workpieceId || busy) return;
    setBusy(true); setActiveOperation("video"); setError(null); setVideoError(null); setTerminalGenerationAttempt(null); setPendingReplacement(null); setMessage("Preparing the Runway cost confirmation. No video has been submitted yet.");
    try {
      const quote = await generateCanonicalBrollVideo({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, prompt: state.promptsByBeat[beatId], referenceImages });
      if (quote.ok) { setState(quote.data); setMessage("An identical completed Runway result already exists. No new generation or credit charge was made."); return; }
      if (quote.code === "broll_terminal_generation_attempt" && quote.terminalAttempt) {
        setSpendingQuote(null);
        setPendingGeneration(null);
        setTerminalGenerationAttempt(quote.terminalAttempt);
        setPendingReplacement({ beatId, referenceImages });
        setMessage("Previous generation attempt ended before Runway was called. No Forge Credits were charged.");
        return;
      }
      if (!quote.requiresConfirmation || !quote.spendingQuote) { setVideoError(quote.error); setMessage("Runway generation did not start."); return; }
      setSpendingQuote(quote.spendingQuote);
      setPendingGeneration({ beatId, referenceImages, generationAttempt: null });
      setMessage("Review the exact customer ceiling and failure terms below. Runway has not been called.");
    } finally { setBusy(false); setActiveOperation(null); }
  }, [args.workspaceId, args.workpieceId, busy, state.promptsByBeat]);

  const startNewGenerationAttempt = useCallback(async () => {
    if (!args.workspaceId || !args.workpieceId || !terminalGenerationAttempt?.replacementAllowed || !pendingReplacement || busy) return;
    setBusy(true); setActiveOperation("video"); setError(null); setVideoError(null);
    setMessage("Starting the authorized replacement attempt and preparing its price. Runway has not been called.");
    try {
      const prompt = state.promptsByBeat[pendingReplacement.beatId];
      const started = await startReplacementRunwayGenerationAttempt({
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        beatId: pendingReplacement.beatId,
        prompt,
        referenceImages: pendingReplacement.referenceImages,
      });
      if (!started.ok) { setVideoError(started.error); setMessage("A new generation attempt was not started."); return; }
      const quote = await generateCanonicalBrollVideo({
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        beatId: pendingReplacement.beatId,
        prompt,
        referenceImages: pendingReplacement.referenceImages,
        generationAttempt: started.data,
      });
      if (quote.ok) { setState(quote.data); setMessage("The replacement operation already completed. No duplicate generation or charge was made."); return; }
      if (!quote.requiresConfirmation || !quote.spendingQuote) { setVideoError(quote.error); setMessage("The replacement quote could not be prepared. Runway was not called."); return; }
      setSpendingQuote(quote.spendingQuote);
      setPendingGeneration({ ...pendingReplacement, generationAttempt: started.data });
      setTerminalGenerationAttempt(null);
      setPendingReplacement(null);
      setMessage("Review the exact 160-Forge-Credit price below. Runway has not been called and no funds are reserved.");
    } finally { setBusy(false); setActiveOperation(null); }
  }, [args.workspaceId, args.workpieceId, terminalGenerationAttempt, pendingReplacement, busy, state.promptsByBeat]);

  const acceptSpendingQuote = useCallback(async () => {
    if (!args.workspaceId || !args.workpieceId || !spendingQuote || !pendingGeneration || busy) return;
    if (new Date(spendingQuote.expiresAt).getTime() <= Date.now()) {
      setVideoError("This quote expired. Request a new Runway quote before generation.");
      setSpendingQuote(null); setPendingGeneration(null); return;
    }
    if (!spendingQuote.customerSpendingEnabled) {
      setVideoError("Customer Runway spending is not active yet. No funds were reserved and Runway was not called.");
      return;
    }
    if (!spendingQuote.fundingEligible) {
      setVideoError("This account has no verified eligible funding for the quoted maximum charge.");
      return;
    }
    setBusy(true); setActiveOperation("video"); setError(null); setVideoError(null);
    setMessage("Funding the accepted ceiling and submitting one replay-safe Runway operation…");
    try {
      const acquired = await generateCanonicalBrollVideo({
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        beatId: pendingGeneration.beatId,
        prompt: state.promptsByBeat[pendingGeneration.beatId],
        referenceImages: pendingGeneration.referenceImages,
        acceptedQuote: spendingQuote,
        generationAttempt: pendingGeneration.generationAttempt,
      });
      if (!acquired.ok) {
        setVideoError(acquired.error);
        setMessage(acquired.code === "broll_runway_submission_unknown"
          ? "Submission status is uncertain. The reservation remains held and Forge will not submit again automatically."
          : "Runway generation did not complete. No duplicate submission will be made by retrying the same operation.");
        if (acquired.code !== "broll_runway_submission_unknown") {
          setSpendingQuote(null);
          setPendingGeneration(null);
        }
        return;
      }
      setState(acquired.data);
      setSpendingReceipt(acquired.spendingReceipt ?? null);
      setSpendingQuote(null); setPendingGeneration(null);
      setMessage("Runway generation complete. The customer receipt and verified media are ready.");
    } finally { setBusy(false); setActiveOperation(null); }
  }, [args.workspaceId, args.workpieceId, spendingQuote, pendingGeneration, busy, state.promptsByBeat]);

  const dismissSpendingQuote = useCallback(() => {
    if (busy) return;
    setSpendingQuote(null); setPendingGeneration(null); setError(null); setVideoError(null);
    setMessage("Generation cancelled. No reservation was created and Runway was not called.");
  }, [busy]);

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
    setBusy(true); setActiveOperation("motion_prompt"); setError(null); setMotionPromptError(null); setMotionPromptQuote(null); setPendingMotionPrompt(null); setMessage("Creating the canonical motion brief and prompt… Keep this page open.");
    try {
      const generated = await generateCanonicalBrollPrompt({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId, creatorDirection, current: state.promptsByBeat[beatId] ?? { status: "missing", revisionId: null, revision: 0, contentHash: null, creatorDirection: "", finalPrompt: null, motionBrief: null, mismatchReasons: [] } });
      if (!generated.ok && generated.requiresConfirmation && generated.motionPromptSpendingQuote) {
        setMotionPromptQuote(generated.motionPromptSpendingQuote); setPendingMotionPrompt({ beatId, creatorDirection });
        setMessage("Review the exact motion-prompt price. OpenAI has not been called and no credits are reserved."); return;
      }
      if (!generated.ok) { setMotionPromptQuote(null); setPendingMotionPrompt(null); setError(generated.error); setMotionPromptError(generated.error); setMessage(null); return; }
      setState(generated.data); setMessage("Canonical motion brief and prompt are ready.");
    } finally { setBusy(false); setActiveOperation(null); }
  }, [args.workspaceId, args.workpieceId, busy, state.promptsByBeat]);

  const acceptMotionPromptQuote = useCallback(async () => {
    if (!args.workspaceId || !args.workpieceId || !motionPromptQuote || !pendingMotionPrompt || busy) return;
    if (new Date(motionPromptQuote.expires_at).getTime() <= Date.now()) {
      setError("This motion-prompt quote expired. Request a new quote before generation.");
      setMotionPromptQuote(null); setPendingMotionPrompt(null); return;
    }
    if (!motionPromptQuote.funding_eligible) {
      setError(`No verified eligible funding is available. ${motionPromptQuote.funding_label}`); return;
    }
    setBusy(true); setActiveOperation("motion_prompt"); setError(null); setMotionPromptError(null);
    setMessage("Reserving the accepted one-credit ceiling and creating the canonical motion prompt…");
    try {
      const current = state.promptsByBeat[pendingMotionPrompt.beatId] ?? { status: "missing" as const, revisionId: null, revision: 0, contentHash: null, creatorDirection: "", finalPrompt: null, motionBrief: null, mismatchReasons: [] };
      const generated = await generateCanonicalBrollPrompt({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, beatId: pendingMotionPrompt.beatId, creatorDirection: pendingMotionPrompt.creatorDirection, current, acceptedQuote: motionPromptQuote });
      if (!generated.ok) { setMotionPromptQuote(null); setPendingMotionPrompt(null); setError(generated.error); setMotionPromptError(generated.error); setMessage(null); return; }
      setState(generated.data); setMotionPromptQuote(null); setPendingMotionPrompt(null);
      setMessage("Canonical motion brief and prompt are ready. One accepted Test charge was settled.");
    } finally { setBusy(false); setActiveOperation(null); }
  }, [args.workspaceId, args.workpieceId, motionPromptQuote, pendingMotionPrompt, busy, state.promptsByBeat]);

  const dismissMotionPromptQuote = useCallback(() => {
    if (busy) return;
    setMotionPromptQuote(null); setPendingMotionPrompt(null); setError(null);
    setMessage("Motion-prompt generation cancelled. No reservation was created and OpenAI was not called.");
  }, [busy]);

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
  return { state, loading, busy, activeOperation, error, motionPromptError, videoError, motionPromptQuote, message, spendingQuote, spendingReceipt, terminalGenerationAttempt, progress, refresh, generatePlan, generatePrompt, acceptMotionPromptQuote, dismissMotionPromptQuote, editPrompt, proposeRunwayPrompt, generateVideo, startNewGenerationAttempt, acceptSpendingQuote, dismissSpendingQuote, upload, attachExternal, select };
}
