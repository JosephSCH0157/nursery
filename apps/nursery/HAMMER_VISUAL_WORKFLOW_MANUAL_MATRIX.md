# Hammer Visual Workflow Manual Matrix

Purpose: strict runtime click-through for the visual workflow consolidation gate.

Date: 2026-03-28  
Workspace: `d:\nursery\nursery`

## Automated Pre-check Evidence

- `pnpm --filter @forge/hammer build` -> PASS
- `pnpm --filter nursery typecheck` -> PASS
- `pnpm --filter @forge/hammer exec tsx tests/hammerVisualPreviewRules.test.ts` -> PASS
- `pnpm --filter @forge/hammer test:visual-placements` -> PASS
- `pnpm --filter nursery test:hammer-visual-preflight` -> PASS

## Manual Matrix

### 1) Timeline Image Beat (External Pattern)

Steps:
1. Open Hammer, Source tab `Images`.
2. Select a timeline image beat card.
3. Click `Copy Prompt`.
4. Click `Send to Provider`.

Expected:
- Prompt copied from the beat-level prompt (not full JSON/object export).
- Pacing tokens like `[pause]`, `[beat]`, `[reflective pause]` are stripped.
- Provider bridge opens successfully.

Result:
- [ ] PASS
- [ ] FAIL
- Notes:

### 2) B-roll (External Pattern)

Steps:
1. Open Hammer, Source tab `B-roll` -> step `B-roll`.
2. On a B-roll item, click `Copy Prompt`.
3. Click `Send to Provider`.

Expected:
- Prompt copies cleanly.
- Provider bridge opens successfully.
- Behavior matches timeline-image/thumbnail external model.

Result:
- [ ] PASS
- [ ] FAIL
- Notes:

### 3) Reference Clip / CDC (Internal Pattern)

Steps:
1. Open Hammer, Source tab `B-roll` -> step `Reference Clips`.
2. Pick a planned reference beat.
3. Click `Generate`.
4. Confirm preview appears on the card.
5. Click `Regenerate`.
6. Confirm generated output updates.

Expected:
- No external-provider/manual-bridge controls are shown on reference cards.
- In-house generation produces real PNG output.
- Generated clip is attachable/placeable in downstream flow.

Result:
- [ ] PASS
- [ ] FAIL
- Notes:

### 4) Thumbnail (External Pattern)

Steps:
1. Open Hammer `Packaging`.
2. In `Thumbnail Prompt`, click `Copy Prompt`.
3. Click `Send to Provider`.

Expected:
- Prompt copied cleanly.
- Provider bridge opens successfully.

Result:
- [ ] PASS
- [ ] FAIL
- Notes:

### 5) Media Map Removal Rules

Steps:
1. Open `B-roll` -> step `Media Map`.
2. Remove one beat.
3. Navigate away and back to Media Map (or re-open tab).
4. Confirm removed beat is still absent.
5. Click `Redo Media Map`.
6. Confirm beat can reappear only after explicit redo.

Expected:
- No passive reappearance after remove.
- Reappearance occurs only via explicit `Redo Media Map`.

Result:
- [ ] PASS
- [ ] FAIL
- Notes:

## Gate Statement

Pass condition statement:

`Hammer visual workflow now supports per-beat usability on external media, true in-house reference generation, and explicit-only Media Map regeneration without dead-end behavior.`

Overall Gate:

- [ ] PASS
- [ ] FAIL

