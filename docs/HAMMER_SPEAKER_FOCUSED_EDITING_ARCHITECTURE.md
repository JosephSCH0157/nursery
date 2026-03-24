# Hammer Speaker-Focused Editing Architecture

## Purpose
Define Forge-grade speaker-focused editing modes that transform Hammer from timeline-only editing into conversational-structure editing while preserving Hammer safety guarantees.

This spec is implementation-oriented and aligned with existing Hammer architecture:
- transcript-led selection
- non-destructive layers
- preview-first apply
- undoable transactions
- Tongs-backed canonical persistence

## Product Intent
Hammer should allow creators to edit by conversational role, not just time.

Core outcome:
- "Cut the junk, keep the conversation intent."

Primary domains:
- podcasts
- interviews
- debates/panels
- remote crosstalk recordings

## Non-Negotiables
- Raw transcript remains recoverable and unchanged.
- Mode outputs are derived layers, not destructive rewrites.
- Every mode supports preview before apply.
- Apply is one undoable transaction.
- User control over mode parameters and strength.
- No hidden AI rewrite path in deterministic slices.

## Mode Set (MVP to V1)

### 1) Solo Mode
Goal: keep one primary speaker and remove or de-emphasize others.

Options:
- `primarySpeaker`: `S1 | S2 | G1 | G2`
- `othersPolicy`: `remove | collapse_to_pauses | keep_as_prompts`
- `compressGaps`: `boolean`
- `preserveEmphasisPauses`: `boolean`

### 2) Interview Mode
Goal: preserve host prompts while tightening guest answers.

Options:
- `hostSpeaker`: `S1 | S2 | G1 | G2`
- `guestSpeakers`: `string[]`
- `tightness`: `light | medium | tight`
- `preserveReactions`: `boolean`
- `removeBackchannels`: `boolean`

### 3) Monologue Cleanup Mode
Goal: remove crosstalk/interruption noise and preserve coherent turn flow.

Options:
- `primaryFlowSpeaker`: optional speaker id
- `removeOverlaps`: `boolean`
- `removeSideComments`: `boolean`
- `smoothInterruptions`: `light | medium`

### 4) Panel Mode (V1 extension)
Goal: moderator-led multi-speaker clarity.

Options:
- `moderatorSpeaker`: `S1 | S2 | G1 | G2`
- `tightness`: `light | medium | tight`
- `enforceTurnBalance`: `boolean`
- `removeTalkOver`: `boolean`

## Interaction Model

### Conversation Mode Control
Compact selector in Hammer transcript/polish rail:

- `Standard`
- `Solo`
- `Interview`
- `Monologue Cleanup`
- `Panel`
- `Custom` (later)

Selecting a mode reveals mode-specific controls and one preview action.

### Apply Flow
1. User picks mode + options.
2. Hammer computes deterministic proposal layer.
3. Preview summary shown:
   - affected speakers
   - segments touched/removed
   - estimated time saved
   - confidence label
4. Apply as one transaction.
5. Layer remains toggleable/selectable.

## Data & Persistence Model

Use existing Hammer derived transcript layer system (`derived_text_layers`) as first-class storage for mode outputs.

### Layer Metadata Extensions
For mode-generated layers, set:
- `macro_kind`: new mode macro kinds
- `recipe_ref`: mode recipe id
- `summary`: changed counts + removals
- `changes.operations`: deterministic operation traces

Recommended new macro kinds:
- `speaker_solo`
- `speaker_interview`
- `speaker_monologue_cleanup`
- `speaker_panel`

No new persistence subsystem is required for MVP.

## Deterministic Engine Design

### Input
- Canonical transcript segments with speaker labels
- Selected mode + options
- Optional selected range constraints

### Output
- Derived layer changes (`segment_id -> cleaned_text` and/or removed flags)
- Optional segment-structure mutation proposal for preview apply
- Deterministic operation ledger (for trust/audit)

### Core Operations
- `speaker_filtered`
- `backchannel_removed`
- `filler_removed`
- `repetition_collapsed`
- `overlap_suppressed`
- `interruption_smoothed`
- `gap_compressed`

### Confidence Scoring
Deterministic confidence bands based on operations:
- High: speaker filtering + obvious fillers + explicit backchannels
- Medium: repetition/overlap heuristics with mild ambiguity
- Low: interruption smoothing with semantic risk

## Mode Heuristics (Deterministic First)

### Solo
- Keep primary speaker segments.
- For non-primary:
  - remove OR transform per `othersPolicy`.
- Preserve pause cadence by optional gap compression threshold.

### Interview
- Keep host segments by default.
- For guest segments:
  - run tighten rules by `tightness`.
- Optional backchannel removal patterns:
  - `mm-hmm`, `yeah`, `right`, `got it`, etc.

### Monologue Cleanup
- Detect likely crosstalk by short low-information interruptions from non-primary voice.
- Remove side comments below token/confidence thresholds.
- Preserve turn order timestamps after ripple normalization.

### Panel
- Preserve moderator scaffolding.
- Tighten participant turns.
- Suppress overlapping talkover fragments.
- Keep debate structure without forcing uniform length.

## Safety Rules
- Never mutate raw transcript directly.
- Never auto-apply mode results.
- Always show before/after summary.
- Keep "Revert to Standard" action immediate.
- If confidence is low, surface explicit warning and default to preview only.

## UI Scope by Slice

### SFM-1 (MVP, deterministic)
- Conversation Mode selector (Standard/Solo/Interview/Monologue Cleanup).
- Mode options panel.
- Preview + apply + discard.
- Derived layer creation and toggle.
- Single transaction undo.

### SFM-2
- Add Panel mode.
- Add per-mode confidence explanations.
- Add "Primary Voice Focus" weighting.

### SFM-3 (AI-assist, optional)
- AI-assisted tighten proposals behind explicit opt-in.
- Same preview/transaction/undo guarantees.

## Integration Points in Current Codebase
- Derived layers: `apps/hammer/src/macros/hammerDerivedTranscriptLayers.ts`
- Transcript cleanup primitives: `apps/hammer/src/editor/hammerCleanupTools.ts`
- UI shell + apply mutation path: `apps/hammer/src/editor/HammerWorkspaceShell.tsx`
- Timeline segment ops: `apps/hammer/src/editor/hammerWorkspaceTimeline.ts`
- History/undo: `apps/hammer/src/editor/hammerWorkspaceHistory.ts`

## Acceptance Criteria (MVP)
- User can choose Solo/Interview/Monologue Cleanup.
- Preview shows touched speakers, segment deltas, time saved, confidence.
- Apply writes derived layer, not destructive raw rewrite.
- Undo reverts in one action.
- Turning mode/layer off restores original transcript view.
- No persistence contract break with Tongs.

## Out of Scope (for MVP)
- Full multi-version mode manager UI.
- Cross-mode comparison matrix.
- Automatic background mode switching.
- Relationship simulation or aggressive persona edits.

