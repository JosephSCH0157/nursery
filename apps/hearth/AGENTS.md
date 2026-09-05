# Hearth — Agent Rules

This file defines non-negotiable rules for Hearth.
All contributors (human or AI) MUST follow these rules.

If code behavior contradicts this document, the code is wrong. Lifecycle semantics defer to
`../../FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`; current executable authority and degraded
states are recorded in `HEARTH_CANONICAL_AUTHORITY.md`.

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

---

## 1. What Hearth Is

Hearth is the **producer** of the Forge.

Hearth is responsible for shaping ideas into production-ready material.

Hearth:
- guides idea → script → metadata
- asks editorial and structural questions
- applies templates and format
- coordinates optional AI assistance
- prepares assets for downstream tools
- curates what is ready to be recorded
- saves and recovers work via the Workspace (cloud)

Hearth decides **what should be made**.
Other tools decide **how it is executed**.

---

## 2. What Hearth Is NOT

Hearth MUST NOT:
- capture audio or video
- control recording hardware
- edit recorded media
- publish content to platforms
- directly analyze platform analytics
- manage file-system persistence
- create or control capture timelines

If a feature implies execution or capture, it does not belong in Hearth.

---

## 3. Canonical Concepts (Do Not Rename)

The following terms are canonical and MUST NOT be overloaded or renamed:

- **Spark**  
  An idea fragment created in Bar-Stock.

- **Episode / Workpiece**
  The pocket that holds:
  - scripts and drafts
  - titles (A/B/C)
  - descriptions and SEO
  - thumbnails, images, and B-roll prompts

  Workpiece is the durable canonical identity. Episode is Hearth's human-facing content label,
  never a second persisted identity.

- **Recording Session**  
  A scheduled or active capture session created in the **Calendar**.
  Recording Sessions may reference one or more Episodes.

- **Session List**  
  A Hearth-curated list of Episodes that are ready to record.
  This is an editorial priority list, not a capture timeline.

- **Tool**  
  Anvil, Hammer, Quench, Ledger.
  Tools execute actions; they do not decide editorial intent.

- **Workspace**  
  The internal system (via Tongs) that owns persistence and recovery.
  Hearth does not own storage.

Do not introduce alternate names.
Do not reuse “session” as a generic term.

---

## 4. Authority Boundaries

- Hearth owns **editorial intent**.
- Hearth curates what is ready and important.

- The Calendar owns **capture scheduling**.
- Anvil executes recording.
- Hammer executes editing.
- Quench executes publishing.
- Ledger executes analysis.

- Hearth does NOT own memory.
- All persistence is handled by the Workspace.
- Hearth may request saves but does not decide storage location.

One concept MUST have exactly one authority.
Split-brain is a defect.

---

## 5. Episode Rules

- Every Spark MUST belong to an Episode.
- Episodes are auto-created deterministically when needed.
- Episode names are human-readable labels, not identity.
- Renaming an Episode MUST NOT break references.

Hearth always operates within a single active Episode context.

---

## 6. Session List Rules

- Hearth curates the **Ready list**; Tongs persists its canonical lifecycle state.
- The Session List contains Episodes that are ready to record.
- Episodes in the Session List are ordered by editorial importance:
  - trending
  - hot
  - evergreen
  - or other priority signals

Ready is reversible editorial candidacy. It is not approval, scheduling, locking, recording,
or publish readiness. The Ready list is advisory.
It does NOT start, schedule, or control recording.

---

## 7. Asset Creation

Hearth may generate:
- thumbnails
- images
- B-roll prompts or assets

These assets:
- are associated with an Episode
- are saved via the Workspace
- may include placement hints (e.g., sentence references)

Execution and final placement are handled by downstream tools.

---

## 8. AI Usage Rules

AI is optional.

There is NO “Run AI” button.

AI interaction happens through conversation.

Any action that consumes AI credits MUST:
- be explicit
- request confirmation
- respect user preference (always approve / never approve)

A durable, explicitly granted and revocable authorization may cover bounded Bar-Stock discovery refreshes. Login or opening Bar-Stock is never authorization. Each refresh must still pass current policy, role, funding, lease, and budget checks; revocation stops additional provider or model calls.

Non-AI helpers MUST NOT consume AI credits, including:
- punctuation correction
- grammar cleanup
- deduplication
- fixing rambling sentences
- structural cleanup

Hearth MUST remain fully usable with AI disabled.

AI accelerates work; it does not replace baseline functionality.

---

## 9. Determinism

Hearth MUST behave deterministically without AI.

- Templates
- Defaults
- Naming
- Structure
- Session List behavior
- Saving behavior

All of the above MUST work without AI.

---

## 10. Saving Model

- Saving is automatic and cloud-first.
- Persistence is owned by the Workspace.
- Local mirroring is configured at the Podcaster's Forge level, not in Hearth.
- Hearth must show clear state:
  - editing
  - saving
  - saved
  - unsaved / offline

Closing Hearth MUST NOT lose work.

---

## 11. Change Discipline

If you encounter a situation where:
- two systems appear to decide the same thing, or
- a concept requires a second identifier, or
- behavior must be “explained later”

STOP.

Do not patch around it.
Do not introduce compatibility hacks.
Raise a design issue.

This project explicitly rejects silent complexity.

---

## 12. Design Principle

Hearth prioritizes:
- clarity over cleverness
- determinism over magic
- trust over automation
- human judgment over shortcuts

This is intentional.

---

## 13. Navigation Boundary

Hearth navigation is governed by `HEARTH_NAVIGATION_CONTRACT.md`.

Non-negotiable rule:

- Persistence is not navigation.

Contributors MUST keep intermediate editorial artifacts attached to the active workpiece shell by default.

Intermediate artifacts MUST NOT be modeled as peer navigation entities in the left rail.
