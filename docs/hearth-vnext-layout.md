# Hearth VNext Layout Contract

Status: Draft (Phase 1 lock)  
Date: 2026-03-01  
Scope: UX structure and behavior contract only. No implementation details.

## Purpose

Lock the Hearth production layout and mode behavior before refactoring UI code, so view architecture stays deterministic and avoids iteration thrash.

## Global Layout

Hearth is a two-region workspace:

1. Left Rail (navigation + control categories)
2. Main Surface (active mode content)

Focus Mode is not an entry state. It is an explicit state entered only when an Episode is opened.

## Left Rail Contract

Left Rail order is fixed:

1. Sparks
2. Episodes (In Progress)
3. Ready
4. Series
5. API / Ledger (pinned at bottom)

Behavior:

- Left rail selection switches the Main Surface mode.
- Left rail does not auto-open Focus Mode.
- Left rail persists while Main Surface content changes.

## Main Surface Contract

Main Surface renders one list/editor view at a time based on current mode:

- `sparks`: Spark list view
- `episodes`: Episode list view (in-progress work)
- `ready`: Ready list view (session-list candidates)
- `series`: Series list view
- `focus`: Focus editor view for a selected Episode

Rules:

- Default entry mode is `sparks`.
- No conversation-first auto-focus on entry.
- Focus Mode is entered only via explicit Episode open action.
- Exiting Focus Mode returns to the previously selected list mode.

## Ready View Functional Contract

Ready is the authoritative editorial session-list surface and must support:

1. Drag reorder (deterministic ordering)
2. Remove from Ready
3. Send to Anvil
4. Label state per item: Hot, Evergreen, Series

Authority note:

- Hearth curates and orders Ready items.
- Ready ordering is the source order for downstream Recording Session planning.

## Anvil Script Source Contract

Anvil script loading must expose a single Script Source selector with only:

1. Recording Session
2. Workspace Library

Definitions:

- Recording Session: ordered script list from a selected session.
- Workspace Library: script list from workspace catalog, defaulting to Ready.

Rules:

- Source selection must be explicit.
- No auto-session creation.
- No heuristic source switching.
- No automatic recording start.

## Determinism and Scope Guardrails

- No animation requirements in this phase.
- No styling polish requirements in this phase.
- No mobile-specific adaptation requirements in this phase.
- No AI workflows in this phase.
- No automation-driven session behavior in this phase.

All follow-on implementation must satisfy this contract before visual polish or advanced integrations.
