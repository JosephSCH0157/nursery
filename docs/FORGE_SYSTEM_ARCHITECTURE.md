# Forge System Architecture Map (Canonical View)

## 1) The Big Picture

Forge is a pipeline of specialized tools sharing one canonical backbone.

Bar Stock -> Hearth -> Tongs -> Anvil -> Hammer -> Quench -> Ledger

- Bar Stock: Ideas capture
- Hearth: Scripts + AI
- Tongs: Canonical storage
- Anvil: Record media
- Hammer: Edit layer
- Quench: Publish + schedule
- Ledger: Analytics + growth

Key rule:
Tongs is the canonical data layer. Everything else is a tool that reads/writes via Tongs.

## 2) Canonical Ownership Matrix

This is the "who owns the truth" table.

| Domain | Canonical Owner | Notes |
| --- | --- | --- |
| Workspaces / orgs / access | Tongs | Permissions, membership, locks |
| Projects / Workpieces | Tongs | Project identity, structure |
| Episode title | Hearth -> stored in Tongs | Set upstream, stays stable |
| Script drafts + revisions | Hearth -> stored in Tongs | Text content, edit history |
| Transcripts | Tongs (created by pipeline) | Used by Hammer/Quench |
| Shorts suggestions + SEO | Hearth -> stored in Tongs | Candidates, titles, descriptions |
| Media bytes (recordings/exports) V1 | Local mapped folder | Until cloud media is enabled |
| Media bytes (future) | Tongs-backed cloud | Phase later (cost control) |
| Edit instructions (non-destructive) | Hammer -> stored in Tongs | Timeline edits, placements |
| Published metadata + schedule | Quench -> stored in Tongs | Platform targets, publish state |
| Analytics | Ledger -> stored in Tongs | Pulls platform stats + outcomes |

## 3) Tool-by-Tool Responsibilities

### Bar Stock (Idea capture)

Inputs: user thoughts, links, voice notes (optional)

Outputs (to Tongs):

- sparks (idea items)
- tags
- optional priority / grouping

Bar Stock is fast capture, not deep writing.

### Hearth (Script and editorial brain)

Inputs: sparks from Tongs, user prompts, research sources (later)

Outputs (to Tongs):

- episode title (canonical)
- scripts + revisions
- segment/beat structure
- asset requests (images/B-roll prompts)
- shorts candidates + SEO packets
- placement hints (fuzzy anchors tied to transcript/script)

Hearth is where thinking happens.

### Tongs (Canonical storage + contracts)

Inputs: everything

Outputs: everything (through contracts)

Tongs provides:

- workpiece/workflow structure
- permissions
- versioning / events
- edit locks (v1 single editor in Hammer)
- pointers to local media (v1) and cloud media (future)

Tongs is the source of truth.

### Anvil (Recording)

Inputs: script from Tongs, session metadata

Outputs:

- recordings (media bytes) -> local mapped folder (v1)
- recording session metadata -> Tongs
- optional calibration profiles (room/mic)
- pointers (hash/paths/duration) -> Tongs

Anvil creates the raw capture + structured session info.

### Hammer (Editing)

Inputs:

- metadata, transcript, assets, shorts packets from Tongs
- recordings/exports bytes from mapped folder (v1)

Outputs (to Tongs):

- edit instructions (timeline cuts, ripple results, overlays)
- audio settings (studio sound presets per episode / workspace)
- approved shorts boundaries
- export records (what was exported + local path pointer)

Hammer edits are instruction layers only (non-destructive).
Media bytes remain local in v1.

### Quench (Publishing and distribution)

Inputs: final cut definitions + assets + SEO from Tongs (and local exports in v1)

Outputs (to Tongs):

- publish targets (YT, Spotify, Rumble, RSS, etc.)
- schedules
- upload status
- final published URLs/IDs

Quench is "push button distribution."
In v1, it may consume local exports; later it can pull from cloud media.

### Ledger (Analytics and growth)

Inputs: platform stats + Quench publish outputs

Outputs (to Tongs):

- CTR / watch time / retention
- subscriber growth metrics
- short performance rollups
- episode vs short attribution (later)

Ledger closes the loop: "what worked?"

## 4) Data Flow Maps

### A) Episode Creation Flow

Bar Stock spark
-> Tongs
-> Hearth writes title + script + shorts + assets
-> Tongs
-> Anvil records media -> mapped folder
-> Tongs (pointers + transcript)
-> Hammer writes edit instructions -> Tongs
-> Mapped folder (exports)
-> Quench schedules/uploads
-> Ledger analytics

### B) Shorts Flow (the magic path)

Hearth identifies short candidates + writes SEO
-> Tongs stores candidates
-> Hammer opens Shorts mode and shows suggested clips
-> User trims/approves
-> Hammer exports shorts locally + registers to Tongs
-> Quench publishes with SEO already done

## 5) The Two-Location Reality in V1

Canonical statement:

- Tongs stores the truth about the project (title, transcript, edits, metadata, pointers).
- Mapped folder stores big files (recordings, exports) until cloud is enabled.

Hammer and Quench must:

- resolve pointers via workspace-level mapping
- degrade gracefully if media is not present locally
- support Relink/Import when moving between machines

## 6) Trust and Control Principles Across the System

- Non-destructive editing (Hammer never mutates source)
- AI suggests, humans decide (Hearth proposes, Hammer approves)
- Canonical metadata lives in Tongs (no secret side storage)
- Costs are controlled (no cloud media until revenue supports it)
- Deterministic pipelines (stable titles, stable pointers, stable contracts)

## 7) V1 Locks vs VNext

V1 locked:

- Single-editor locking for Hammer
- Local media bytes via mapped folder
- Tongs as canonical metadata + instruction store

VNext:

- Cloud media bytes (recordings + exports)
- Cross-machine "just works"
- Collaborative editing
- Remote recording pipeline integration (host/guest local tracks + upload)
