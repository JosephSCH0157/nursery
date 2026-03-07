# HAMMER V1 MANIFEST (CANONICAL DRAFT)

Tool: Hammer  
Forge Role: Non-destructive podcast-first video/audio editor  
Status: Canonical Draft - V1 Architecture Locked

## 1. Purpose

Hammer is the editing workstation of Podcaster's Forge.

Its job is to transform recorded sessions into publishable episodes and shorts while preserving the integrity of the original media.

Hammer prioritizes:

- dialogue editing
- transcript-driven workflows
- repeatable creator pipelines
- non-destructive editing
- minimal friction for podcast production

Hammer is not intended to compete with cinematic editors like Premiere, Final Cut, or DaVinci.

Instead it is optimized for:

- podcasts
- interview shows
- commentary shows
- panel discussions
- remote guest sessions

Hammer may also edit general media, but that is secondary to its podcast-first design.

## 2. Design Philosophy

Hammer deliberately blends the strongest concepts from three existing tools.

### Descript

- transcript-based editing
- speech cleanup tools
- dialogue-first workflows

Hammer intentionally does not replicate AI voice rewriting.

Transcript edits control timeline cuts only.

### ElevateIO

- creator workflow acceleration
- upstream intelligence
- shorts packaging pipeline

Hearth performs heavy discovery work so Hammer focuses on editing and approval.

### Windows Movie Maker

- simplicity
- intuitive timeline
- low track count
- quick learning curve

Hammer intentionally avoids complex multi-track editing systems.

## 3. Tool Role Inside Forge

Forge Pipeline:

- Hearth -> Idea development + metadata + assets
- Anvil -> Recording
- Tongs -> Canonical storage + manifests
- Hammer -> Editing
- Quench -> Publishing + distribution
- Ledger -> Analytics

Hammer never owns canonical data storage.

It operates entirely through Tongs contracts.

## 4. Storage Model

### 4.1 Canonical Data Ownership

Tongs is the canonical database and metadata store.

Tongs owns:

- episode titles
- transcripts
- asset metadata
- shorts metadata
- edit instructions
- manifests

Hammer reads and writes through the Tongs contract layer.

### 4.2 Media Bytes (V1 Policy)

Until Forge revenue supports cloud media storage:

Large media files remain local.

Media locations:

| Data Type | Location |
| --- | --- |
| Metadata | Tongs |
| Transcripts | Tongs |
| Shorts metadata | Tongs |
| Assets metadata | Tongs |
| Raw recordings | mapped local folder |
| Rendered exports | mapped local folder |

Hammer therefore resolves media from two locations.

### 4.3 Media Resolver

Hammer resolves media in this order:

1. mapped folder local path
2. cloud path (future)
3. unresolved state

If media is missing locally:

Hammer displays Media Missing but allows metadata browsing.

### 4.4 Workspace Media Mapping

Mapped media roots are configured per workspace.

Each machine may map the workspace root to a different physical path.

Example:

Machine A

`D:\ForgeMedia\`

Machine B

`/mnt/media/forge/`

Hammer resolves paths relative to the workspace mapping.

## 5. Project Entry

When Hammer launches it presents a project library.

Each project card displays:

- episode title
- recording date
- duration
- thumbnail (optional)
- recording source

Users may also import external media.

External media editing is supported but lacks transcript automation unless transcripts exist.

## 6. Editor Layout

Hammer uses a single main editing workspace.

Top Bar

Left Panel   |   Preview   |   Tools Panel

Timeline

### 6.1 Left Panel

Default tab: Transcript

Tabs include:

- Transcript
- Images
- B-roll
- Audio
- Graphics
- Templates
- Exports

Within each tab content may be organized in folders or collections.

This creates a hybrid tab + folder asset system.

## 7. Top Bar

From left to right:

- Menu
- Hammer
- Version
- Reset Edits
- Undo
- Active Target Dropdown
- Full Episode
- Shorts
- AI Controls
- User Account
- Logout

### 7.1 Reset Behavior

Reset removes edit metadata only.

Source media remains untouched.

Reset requires confirmation.

## 8. Timeline Structure

Hammer uses a simplified track model.

- V2 Overlays (images / B-roll)
- V1 Main Video
- A2 Secondary Audio (music / effects)
- A1 Dialogue

### 8.1 Overlay Behavior

V2 overlays render visually over V1.

Default B-roll behavior is overlay.

Users may optionally choose replacement behavior.

### 8.2 AutoRipple

Default: ON

Removing timeline segments automatically closes gaps.

All tracks shift together to preserve sync.

## 9. Transcript Editing

Transcript editing is the primary editing method.

Capabilities:

- delete words
- delete phrases
- remove segments
- navigate playback

Transcript edits translate directly into timeline cuts.

Hammer does not generate replacement dialogue.

## 10. Polish Tools

Located in Polish Mode.

Tools include:

- filler removal
- retake removal
- silence trimming
- jump-cut smoothing

### 10.1 Aggressiveness Slider

Controls how aggressively content is removed.

Levels:

- Conservative
- Balanced
- Aggressive

Meaningful conversational responses must never be removed as filler.

### 10.2 Approval Modes

Users may choose:

- Auto Apply
- Review Major Edits
- Review All Edits

All operations remain undoable.

## 11. Audio Mode

Audio Mode provides Studio Sound controls.

Controls include:

- noise reduction
- EQ shaping
- compression
- de-essing
- low-cut filters

Hammer may recommend settings but users retain full control.

### 11.1 Scope

Users may apply settings to:

- this episode
- all future episodes
- saved preset

Processing remains non-destructive.

## 12. Video Mode

Video Mode manages visual overlays.

Assets placed on V2 include:

- Hearth-generated images
- B-roll
- charts
- graphics
- screenshots

### 12.1 Intro and Outro Templates

Users may build reusable templates.

Templates include:

- video
- audio
- overlays
- timing

Templates may be applied to future episodes.

Workspace defaults may automatically apply.

## 13. Shorts Mode

Hearth provides short candidate metadata.

Metadata includes:

- timestamps
- titles
- SEO
- description

Hammer allows users to:

- preview candidate shorts
- trim boundaries
- approve or reject

Approved shorts pass to Quench ready for publishing.

### 13.1 Active Speaker Framing

For vertical clips Hammer tracks speaker slots:

- S1
- S2
- G1
- G2

Frame focus shifts to the active speaker.

Transitions use fast animated pans.

## 14. Macros

Macros allow automated workflows.

Example macros:

- Podcast Cleanup
- Shorts Package
- Final Export

Macros bundle multiple operations into a single command.

## 15. Export

Exports are generated locally during V1.

Naming uses the canonical episode title from Tongs.

Examples:

- Episode Title - Full.mp4
- Episode Title - Short 01.mp4

Hammer registers export metadata in Tongs.

Rendered files remain local.

## 16. Session Locking

Hammer uses single-editor locking in V1.

Only one user may actively edit a project at a time.

Future versions may support collaborative editing.

## 17. Failure Handling

Hammer must gracefully handle:

- missing media
- missing mapped folders
- incomplete assets

Metadata browsing remains possible even if media is unavailable.

## 18. Non-Destructive Editing Guarantee

Hammer never alters source recordings.

All edits exist as instruction layers stored in Tongs.

Reset removes edits without touching original files.

## 19. V1 Non-Goals

Hammer V1 intentionally excludes:

- cinematic multi-track editing
- AI voice replacement
- complex color grading
- advanced VFX pipelines

These fall outside Hammer's mission.

## 20. Future Expansion (V2+)

Planned expansions include:

- cloud media storage
- collaborative editing
- GPU accelerated preview rendering
- enhanced highlight detection
- deeper Quench automation

## Closing Statement

Hammer is the editing forge of Podcaster's Forge.

It converts recorded conversations into polished content through a workflow designed specifically for creators.

Hammer prioritizes clarity, speed, and trust over cinematic complexity.
