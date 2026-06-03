# ASR Live Follow Control

This document defines the current control contract for ASR-driven teleprompter follow in Anvil.

## Two-Layer Contract

- The semantic layer remains the single source of truth for script position.
- The visual control layer is the only layer allowed to choose the final live scroll target.

The semantic layer keeps existing Whisper ingestion, stabilizer behavior, and bridge lifecycle behavior. Visual recovery must not advance semantic truth.

## Semantic Snapshot

The visual controller consumes a semantic snapshot with:

- `lineIdx`
- `confidence`
- `source`
- `updatedAt`

Only validated ASR commit paths may advance this snapshot.

## Visual Anchor

The controller resolves a visual anchor with:

- `anchorLineIdx`
- `anchorKind`
- `anchorViewportY`
- `anchorCompatibleWithSemantic`
- `matchedLineViewportY`

Anchor priority:

1. Current semantic line when geometry is available
2. Fresh matched/spoken line if semantically compatible
3. Recent accepted-match anchor
4. Fallback current rendered line

Raw `matchBestIdx` may be evidence, but it must never directly become the scroll target.

## Pocket Bands

The visual layer uses three bands derived from the existing marker geometry and measured line height:

- `preferred`
- `tolerated`
- `recovery threshold`

Behavior:

- `preferred`: no meaningful correction
- `tolerated`: gentle nudges allowed
- Below `recovery threshold`: `RECOVER` mode is eligible when freshness and blocker rules pass

## Visual Modes

- `TRACK`: normal live follow, tiny backward comfort adjustments allowed only inside pocket
- `RECOVER`: forward-only recovery when the reader falls visually low or semantic truth outruns the viewport
- `SETTLE`: brief post-recovery preservation and taper
- `HOLD`: blocker-driven freeze/minimal movement

## Recovery Episodes

Recovery episodes preserve a protected forward-safe target:

- `startedAt`
- `expiresAt`
- `protectedLineIdx`
- `protectedTargetScrollTop`
- `reason` = `visual_debt` or `semantic_ahead`

During an active recovery episode:

- lower competing targets lose
- backward correction is disallowed except tiny late-settle corrections
- pocket wall may cap overshoot but may not roll below the protected target
- lead-pressure caps may reduce speed but may not flatten a safe recovery to zero

## Decision Object

The chairperson produces a single scroll decision:

```ts
type AsrVisualMode = 'track' | 'recover' | 'settle' | 'hold';

type ScrollDecision = {
  mode: AsrVisualMode;
  anchorLineIdx: number;
  authority:
    | 'track_follow'
    | 'recover_visual_debt'
    | 'recover_semantic_ahead'
    | 'settle_hold'
    | 'hold';
  targetScrollTop: number;
  maxVelocityPxps: number;
  backwardAllowed: boolean;
  preserveUntilMs: number;
  reason: string;
};
```

## Decision Pipeline

Each live tick follows this order:

1. Read semantic snapshot
2. Build visual anchor
3. Compute marker/pocket geometry and debt
4. Choose mode
5. Produce raw controller target
6. Apply recovery floor if needed
7. Apply active recovery/protection episode
8. Apply pocket wall as a safety modifier
9. Apply mode-specific velocity cap
10. Actuate

## Diagnostics

The controller emits:

- `ASR_VISUAL_CONTROL_RUNTIME_PROOF`
- `ASR_VISUAL_CONTROL_DECISION`
- `ASR_RECOVERY_EPISODE_STARTED`
- `ASR_RECOVERY_EPISODE_EXTENDED`
- `ASR_RECOVERY_EPISODE_ENDED`
- `ASR_BACKWARD_TARGET_REJECTED`
- `ASR_RECOVERY_STEP_APPLIED`
- `ASR_SETTLE_COMPLETE`

Phase 1 is observability and shadow comparison. Ownership handoff is gated separately.
