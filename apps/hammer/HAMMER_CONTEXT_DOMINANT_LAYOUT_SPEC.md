# HAMMER - Context-Dominant Layout Specification

Derived from Forge Design Session - March 21, 2026
Version: v1

## Purpose

This specification defines Hammer's Context-Dominant Layout (CDL) model.

CDL exists to preserve professional editing flow on single-monitor systems while keeping all core regions visible.

Hammer does not use static equal-panel layouts as the default editing posture.

## Core Principle

Hammer uses a Context-Dominant Layout.

All core regions remain visible, but the active context gains space and emphasis while secondary contexts compress gracefully.

Spatial memory is preserved. No core region disappears during normal editing.

## Persistent Regions

The following regions are persistent infrastructure and remain present in normal editing:

- Left Source Bay
- Center Preview Bay
- Right Tool Bay
- Far-Right Toolbar (Patch Bay)
- Bottom Timeline Dock

## Context States

Hammer supports three layout states:

1. Balanced
2. Source-Dominant
3. Time-Dominant
4. Tool-Dominant

Balanced is the neutral shell.

Source-Dominant emphasizes transcript/assets/source material work.

Time-Dominant emphasizes timeline operations.

Tool-Dominant emphasizes active processing/inspection controls.

## Geometry Behavior by State

### Balanced

- Source bay: workable baseline width.
- Preview bay: bounded baseline width.
- Tool bay: workable baseline width.
- Timeline dock: baseline height.
- Toolbar: fixed width and full height.

### Source-Dominant

- Source bay expands.
- Tool bay contracts.
- Preview remains bounded and stable.
- Timeline remains visible and stable.
- Toolbar remains fixed.

### Time-Dominant

- Timeline dock expands vertically within defined limits.
- Top workspace compresses proportionally but remains usable.
- Source, preview, and tool bays remain visible.
- Toolbar remains fixed and full height.

### Tool-Dominant

- Tool bay expands.
- Source bay contracts.
- Preview remains bounded and stable.
- Timeline remains visible and stable.
- Toolbar remains fixed.

## What Never Happens

The following are forbidden in CDL:

- Hiding source, preview, tool, timeline, or toolbar during normal editing.
- Letting preview become the dominant surface by default.
- Treating toolbar as part of adaptive workspace sizing.
- Turning timeline into a footer-like afterthought.
- Using horizontal page scrolling as a layout safety valve.
- Modalizing core workspace interaction.

## Focus Triggers

Focus state changes are explicit and deterministic.

Valid triggers include:

- Selecting source tabs or transcript interactions -> Source-Dominant.
- Entering timeline manipulation tools or timeline interaction -> Time-Dominant.
- Selecting tool workflows from the toolbar -> Tool-Dominant.
- Explicit user reset to neutral -> Balanced.

Focus changes must not reorder regions.

## Single-Monitor Rules

CDL is optimized for single-monitor operation.

Required behavior:

- Preserve all persistent regions in one frame.
- Keep preview bounded and readable.
- Keep timeline available for direct manipulation.
- Expand active context only by compressing secondary regions gracefully.
- Enforce panel minimum sizes to prevent unusable collapse.

## Future Multi-Monitor Extension

Multi-monitor support may extend CDL later.

Future extensions must preserve the same authority model:

- Timeline remains structural authority.
- Toolbar remains routing-only infrastructure.
- Focus determines emphasis, not availability.

Multi-monitor must be an intentional extension, not an accidental responsive collapse.

## Implementation Guidance for Codex/Copilot

When implementing CDL:

- Keep one explicit source of truth for current layout context.
- Apply context through parent shell classes/state.
- Preserve persistent regions across all context states.
- Restrict geometry ownership to canonical shell CSS.
- Do not reintroduce ad hoc pane-resize persistence as shell authority.

## Canonical Summary

Hammer is a production console.

CDL ensures the active task gets space without sacrificing structural continuity.

The user should feel focused, never lost.
