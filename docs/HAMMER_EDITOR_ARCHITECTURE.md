# Hammer Editor Architecture

## Purpose

This document defines the canonical interaction architecture for Hammer.

It complements [`docs/HAMMER_MANIFEST.md`](./HAMMER_MANIFEST.md), which defines the visible UI layout and tool order.

This document answers a different question:

How must Hammer behave as an editor as features deepen?

Hammer is transcript-led in behavior and preview-led in layout.

Hammer edits are non-destructive instruction layers.
Persisted edit state belongs in Tongs.
This document defines how the editor surface should organize that work without collapsing into UI sprawl.

---

## Core Synthesis

Hammer must preserve these two truths at the same time:

- transcript-led behavior
- preview-led layout

That means:

- transcript selection remains the semantic source of editing intent
- preview remains the visual truth surface
- tools remain the only place where edit instructions are created
- timeline remains the temporal surface where consequences are visualized

Hammer must not drift into either of these extremes:

- transcript-only editor with a decorative timeline
- timeline-first editor that loses transcript meaning

---

## Canonical Shell

Hammer uses a stable 4-zone editor model:

1. Zone 1: Visual Context
   Preview monitor
2. Zone 2: Structure / Map
   Transcript navigator
3. Zone 3: Actions
   Active tool workspace
4. Zone 4: Temporal Control
   Timeline

The zones do not rearrange when tools change.

Hammer may rebalance emphasis between zones, but it must not fork into separate editor layouts per tool.

---

## Law 1: Zone 3 Tool Containment

All real editing controls live in Zone 3.

Transcript selects.
Preview verifies.
Timeline visualizes timing and supports light direct manipulation.
Zone 3 creates and manages edit instructions.

New editing power must appear as depth inside Zone 3, not as width across the shell.

Implications:

- no tool-specific side panels outside Zone 3
- no duplicated toolbars attached to transcript rows
- no deep parameter controls attached directly to timeline tracks
- no preview-hosted control clutter

Only one tool is active at a time.

Canonical Hammer tool order remains:

1. Polish
2. Audio
3. Video
4. Captions
5. Details
6. Export

---

## Law 2: Progressive Tool Surfaces

Each tool in Zone 3 reveals power progressively.

Hammer tools should generally follow three layers:

1. Quick actions
   Deterministic one-click actions for the current selection
2. Guided adjustment
   Structured controls for common editorial refinement
3. Advanced controls
   Deeper parameters shown only on explicit request

Advanced controls must expand inside Zone 3.
They must never spill into new global panels.

Default expectation:

- most users live in quick actions
- guided adjustment handles common quality work
- advanced controls remain available without dominating the interface

---

## Law 3: Focus Modes

Hammer supports contextual emphasis without changing the 4-zone shell.

Focus modes are editor states, not layout states.

Recommended focus modes:

- content
- audio
- visual
- delivery

Suggested mapping:

- `polish` -> `content`
- `audio` -> `audio`
- `video` -> `visual`
- `captions` -> `content` by default, with optional delivery bias during verification
- `export` -> `delivery`

Focus modes may adjust:

- panel prominence
- border intensity
- background contrast
- emphasis cues

Focus modes must not:

- move zones
- create new controls
- create tool-specific shell variants

---

## Law 4: Surface Gravity

Each Hammer surface has a primary gravitational role.

- Information gravity -> Preview
- Interaction gravity -> Zone 3
- Selection gravity -> Transcript
- Temporal gravity -> Timeline

This is the rule:

Controls follow interaction gravity.
Status follows information gravity.

Implications:

- preview shows truth, overlays, and verification context
- Zone 3 hosts controls, toggles, and parameters
- transcript owns semantic selection
- timeline owns temporal alignment and light direct manipulation

Preview may show visual guides.
Preview must not become a control dashboard.

Timeline may host light direct manipulation.
Deeper controls must still route back to Zone 3.

---

## Law 5: Selection Continuity

Hammer has exactly one active editorial selection.

Selection is global.
Representation is local.

Every zone reflects the same canonical selection through its own gravity:

- transcript shows semantic identity
- preview shows the visual moment of that selection
- timeline shows when that selection occurs
- tools show what can be done to that selection

Zones may refine the current selection.
No zone may create a competing second selection.

Selection must survive:

- tool changes
- transcript scrolling
- timeline zooming
- playback movement

Selection must be distinct from playhead state.

Selection answers:
what is being edited

Playhead answers:
where playback currently is

---

## Law 6: Selection Inheritance

Multi-selection is not a separate system.
It is an inherited form of the same canonical selection.

Every multi-selection must inherit from a primary selection.

Recommended conceptual shape:

```ts
type EditorSelection = {
  primarySegmentId: string | null;
  segmentIds: string[];
  rangeStartSec: number | null;
  rangeEndSec: number | null;
};
```

Rules:

- the primary segment anchors identity
- the selected set defines action scope
- the refined range narrows temporal precision inside the current selection
- preview follows the primary segment
- timeline may highlight the full selected set
- tools operate on the selected set unless explicitly scoped otherwise

Multi-select must not create a special batch-editing shell.
Batch work is selection depth, not a new editor mode.

---

## Law 7: Selection Scope Language

Every actionable control in Zone 3 must declare its effect scope using canonical product language.

Hammer supports four canonical scopes:

- Primary segment
- Selected segments
- Refined range
- Whole project

Scope answers:
how far this action reaches

Scope is a property of the action, not of the layout.

If scope is ambiguous, the UI must resolve that ambiguity before the action executes.

Scope should appear where needed in:

- tool headers
- helper text
- staging feedback
- confirmation language

Recommended default tendencies:

- Polish: selected segments, fallback to primary segment
- Audio: selected segments, refined range when active
- Video: primary segment by default, selected segments only when batch-safe
- Captions: selected segments or refined range, whole project for rebuild operations
- Export: whole project by default, refined range only when explicit

---

## Law 8: Action Safety Tiers

Every Zone 3 action belongs to a safety tier.

Safety tiers define execution behavior, not permissions.

Hammer uses four canonical tiers:

1. Instant
2. Staged
3. Confirmation required
4. Structural change

Definitions:

- Instant
  Immediate, low-risk, reversible interactions
- Staged
  Creates or updates non-destructive edit instructions
- Confirmation required
  Large-scope or high-ambiguity actions that require explicit confirmation
- Structural change
  Rare actions that alter project structure or editor context

Most editorial changes in Hammer should remain staged.

Safety answers:
how risky this action is to perform

Scope and safety must be visible together whenever risk is non-trivial.

---

## Law 9: Instruction Visibility

Every staged instruction must be visible, understandable, and reversible without leaving the editing context.

Instruction visibility must stay calm.
It must not turn Hammer into a log viewer or diagnostics console.

Hammer uses three visibility levels:

1. Inline indicators
   Transcript, preview, and timeline show where an edit exists
2. Tool-surface feedback
   Zone 3 shows what was just staged
3. Staged Edits layer
   A lightweight stack shows all active staged instructions

Users must always be able to:

- identify a staged instruction
- inspect it
- remove it
- clear staged work when appropriate

Inline surfaces answer:
what changed here

The staged layer answers:
what is currently active overall

---

## Law 10: Instruction Grouping

Multiple staged instructions may belong to a group representing a single editorial intention.

Examples of editorial intentions:

- Remove filler
- Mute cough
- Audio cleanup
- Reframe shot
- Blur background

Groups exist only while edits are staged.
They are temporary editorial containers, not permanent project metadata.

Rules:

- groups are visible in the Staged Edits layer
- groups may be expanded to reveal individual instructions
- undo may target either the group or an individual instruction
- groups must never obscure the underlying instructions

Inline transcript, preview, and timeline markers remain instruction-level.

Inline surfaces answer:
what changed here

Groups answer:
why did it change

---

## Law 11: Edit Passes

Instruction groups may belong to an edit pass representing a broader phase of editorial work.

Examples:

- Dialogue Cleanup
- Audio Polish
- Visual Cleanup
- Caption Work
- Delivery Prep

Passes organize staged work by editorial phase.
They are temporary workflow containers, not saved milestones, branches, or project bureaucracy.

Rules:

- passes are visible only in the Staged Edits layer
- passes organize groups, not raw inline indicators
- passes may be collapsed or expanded
- users may clear an individual instruction, a group, or an entire pass
- passes must never become mandatory workflow gates

Passes answer:
what broader kind of editorial work is happening right now

Recommended default mapping:

- Polish -> Dialogue Cleanup
- Audio -> Audio Polish
- Video -> Visual Cleanup
- Captions -> Caption Work
- Export -> Delivery Prep

---

## Canonical Hierarchy

Hammer should model staged work using this conceptual hierarchy:

```ts
type EditorSelection = {
  primarySegmentId: string | null;
  segmentIds: string[];
  rangeStartSec: number | null;
  rangeEndSec: number | null;
};

type ScopeType =
  | "primary-segment"
  | "selected-segments"
  | "refined-range"
  | "whole-project";

type SafetyTier =
  | "instant"
  | "staged"
  | "confirm-first"
  | "structural";

type EditInstruction = {
  id: string;
  type: string;
  scope: ScopeType;
  safetyTier: SafetyTier;
  segmentIds: string[];
  rangeStartSec?: number;
  rangeEndSec?: number;
  groupId?: string | null;
};

type InstructionGroup = {
  id: string;
  label: string;
  passId: string | null;
  instructionIds: string[];
};
```

Conceptual editing stack:

1. Selection
2. Scope
3. Safety tier
4. Instruction
5. Instruction group
6. Edit pass

That progression lets Hammer scale without creating a second hidden architecture for advanced features.

---

## Implementation Guardrails

When extending Hammer, answer these questions before adding UI:

1. What is the current selection?
2. What scope does this action affect?
3. What safety tier does it belong to?
4. What instruction does it create?
5. How is that instruction made visible?
6. Does it belong to an instruction group?
7. Does that group belong to an edit pass?

If a feature cannot answer those questions clearly, it is not ready to ship in Hammer.

---

## What To Avoid

The following are anti-patterns against this architecture:

- feature-specific side panels outside Zone 3
- preview-hosted parameter dashboards
- timeline tracks that accumulate deep tool controls
- duplicate controls for the same action across transcript, timeline, and tool surface
- tool changes that clear selection
- multi-select that loses a primary anchor
- action buttons with implicit or ambiguous scope
- staged edits with no visible representation
- grouped edits that hide underlying instructions
- edit passes that become mandatory workflow gates

If a change introduces one of these patterns, stop and reevaluate it against this document.

---

## Relationship To Hammer Manifest

[`docs/HAMMER_MANIFEST.md`](./HAMMER_MANIFEST.md) defines:

- shell regions
- tool order
- panel responsibilities
- layout boundaries

This document defines:

- interaction laws
- selection model expectations
- action scope and safety grammar
- staged edit visibility and organization

Both documents must remain aligned.
