# Hearth V1 Manifest — Superseded Historical Record

> Superseded by [HEARTH_CURRENT_MANIFEST.md](HEARTH_CURRENT_MANIFEST.md). This is a historical, non-normative V1 scope record, not the current product contract. Executable authority and lifecycle semantics are governed by [HEARTH_CANONICAL_AUTHORITY.md](HEARTH_CANONICAL_AUTHORITY.md) and the [Forge lifecycle canon](../../FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md).

## Purpose

In V1, Hearth was the conversational script-forging tool. Its purpose was to turn raw ideas (Bar Stock sparks) into record-ready scripts that conformed to Anvil tag rules.

Release status: included in **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

The V1 boundary did not include public metadata, visual planning, or asset generation. Those are later Hearth capabilities described in the current manifest.

---

## Prime Directives (Set in Stone)

1. Never Push
   Hearth may suggest, illuminate, and nudge - but it must never steer, force, optimize, or converge a user toward an outcome.

2. Preserve the User's Voice
   Hearth adapts to intent, style, cadence, pacing, and accessibility needs over time, like a tailored garment - invisible and reversible.

3. Illuminate, Don't Direct
   Hearth always attempts to enrich ideas with background, research, and context, but never implies conclusions or trajectories.

4. User Owns Truth
   Automation may suggest state. Only the user can declare reality (e.g., recording validity, overrides).

---

## Scope Lock (V1)

### Included

* Conversational script development
* Multi-host / guest-aware scripting
* Accessibility-conscious formatting
* Cadence, pacing, and readability
* Strict Anvil-compatible tags only:

  * [s1], [s2], [g1], [g2]
  * [pause], [beat], [reflective pause]
  * [note] (hidden in Anvil)

If it did not help a human read the script aloud in Anvil, it was outside V1.

### Excluded

* Audio or video capture
* Recording-device control
* Destructive or non-linear editing of recorded media
* Public metadata and pre-production visual assets
* Executable timeline ownership or final placement
* Platform upload or publishing

---

## UI and Interaction Model

### Entry State

* On entry, Hearth displays all Bar Stock sparks on the main surface, ready to be selected for heating.

### Focus Mode

* Selecting a spark activates Focus Mode:

  * The active spark dominates the center
  * Hearth enters a conversation-first interaction
  * Other sparks leave the main surface

### Sidebar (Persistent)

* Stays visible at all times
* Organizes:

  * Projects (scripts)
  * Playlists / thematic groupings
* Bottom-most link is reserved for API Controls and Ledger

### Global Navigation

* The Forge links and settings live exclusively in a hamburger menu (top-left)

---

## Bar Stock Stewardship

Hearth is responsible for organizing and cleaning Bar Stock:

* Grouping related sparks
* Surfacing duplicates
* Improving readability
* Suggesting tags and clusters

Hard rules:

* Originals are immutable
* Nothing is deleted
* No ranking by quality
* Cleanup is curatorial, never destructive

---

## Script Readiness and Ownership

The chain and handoff steps below describe the historical V1 workflow; current scheduling belongs to Calendar, and current persistence follows the active authority contracts linked above.

### Authority Chain

* Bar Stock - raw ideas
* Hearth - shaping and readiness curation
* Tongs - canonical script ownership and scheduling
* Anvil - reading and recording

Tongs owns the final script. Hearth never does.

### Script States (Conceptual)

* Warming
* Ready
* Scheduled
* Recorded

Hearth maintains a list of Ready scripts, organized by relevance:

* Hot topic
* Current events
* Evergreen
* Series / arc

No script is ever pushed forward automatically.

---

## Scheduling and Anvil Handoff

1. User creates a recording session in Tongs
2. Tongs presents a list of Ready scripts curated by Hearth
3. User selects script(s) for the session
4. When Anvil opens, it populates its script folder only from that selection

Anvil never guesses. Hearth never schedules.

---

## Recording Completion and Takes

### Local-Only Media Storage (V1)

* Recordings remained local in the original V1 scope
* Media upload was not part of that scope

### Receipt Model

Anvil emits metadata-only receipts to Tongs:

* take_completed (informational)
* take_kept (authoritative)
* take_discarded

### Canon Rule

* A script is marked Recorded in Tongs only when a take_kept receipt exists.
* Bad or discarded takes do not advance state.

### User Override

* Users may reset a script from Recorded to Ready at any time
* Past receipts are preserved for audit, but ignored for state

---

## Failure and Edge-Case Philosophy

* Errors are surfaced as observations, never shame
* Silence is valid input
* Exiting Focus Mode never forces decisions
* All changes are reversible

---

## One-Line North Star

Hearth shaped words for the voice - and nothing else in V1.
