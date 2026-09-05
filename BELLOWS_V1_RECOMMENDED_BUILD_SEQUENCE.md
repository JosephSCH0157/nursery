# BELLOWS V1 - Recommended Build Sequence

## Purpose

Define the highest-confidence implementation order for Bellows V1 so the system is built from stable foundations instead of UI-first guesswork.

Core goal:

Build Bellows as certifiable vertical paths:

Engine -> one-participant capture-to-Hammer -> three-participant desktop -> browser/device expansion -> Broadcast

## Active Record-Only Certification Sequence

This section supersedes the earlier phase ordering where the two differ.

### Milestone 1 - One Participant, Desktop Chromium

The first finish line is one real recording opened from canonical truth in Hammer.

Required in the same vertical slice:

- Chrome and Edge on Windows and macOS
- real `MediaRecorder` audio/video capture
- ordered upload parts held in IndexedDB recovery custody
- playable media segments reconstructed from those parts
- network-loss and page-recovery behavior
- idempotent canonical upload and checksum readback
- integrity evaluation and truthful incomplete outcomes
- adoption through Tongs into Hammer
- audio/video alignment within 40 ms during a 60-minute certification run

Measure alignment at the opening marker, every five minutes, the closing marker,
and around every capture restart. Sixty minutes is a certification duration, not a
product recording limit.

### Milestone 2 - Three-Person Desktop Chromium

After Milestone 1 passes, extend the same capture path to a host and two guests.
Add WebRTC monitoring, reconnect segmentation, cross-participant synchronization,
and server-enforced authority generations. Stale commands from a previous host
generation must fail closed.

### Independent Compatibility Gates

- Desktop Safari
- iOS Safari and Android Chrome mobile guests
- Desktop Firefox

These gates are independent of participant count. They do not block the
three-person desktop milestone, and unsupported devices must remain disabled and
unadvertised until their own gate passes.

### Broadcast Gate

Bellows-managed broadcasting begins only after record-only certification remains
green. Broadcast failure must never be able to stop or corrupt local capture.

## Guiding Principle

Bellows V1 canon is complete enough to begin implementation without further doctrinal expansion.

If implementation effort is available, it should now be directed toward:

- domain types
- state definitions
- engine behavior tests

## High-Confidence Sequence

### Phase 0 - Package Skeleton

Goal: establish Bellows as a Forge tool.

Deliverables:

- `apps/bellows` structure
- routing entry
- package boundary enforcement
- build wiring
- feature flags

No runtime logic yet.

### Phase 1 - Domain Layer

Goal: translate Bellows canon into code-level types.

Examples:

- Session
- Participant
- Role
- Authority
- Track
- Segment
- Event
- State

This prevents later refactors and schema drift inside the codebase.

### Phase 2 - Session Engine Core

Goal: implement the operational state machine as pure deterministic logic.

Rules:

- no UI
- no network
- no media
- no persistence side effects

Focus:

- legal state transitions
- authority enforcement
- recovery entry points
- event emission
- engine behavior tests

### Phase 3 - Capture Subsystem (Local)

Goal: make local-first recording real before distributed coordination or broadcast complexity is introduced.

Scope:

- media access
- local recording
- segmentation
- storage handling

Still no broadcast.

### Phase 4 - Connectivity Layer

Goal: coordinate people around the engine and capture system.

Scope:

- participant join
- session coordination
- signaling
- authority enforcement

This is where the distributed session begins to exist, but it should sit on top of already-stable engine and capture foundations.

### Phase 5 - Minimal Studio UI

Goal: expose only the UI required to operate Bellows safely.

Required surfaces:

- setup screen
- green room
- recording view
- upload state

This UI should reflect engine state rather than invent its own behavior.

### Phase 6 - Broadcast Integration

Goal: add live platform transmission only after recording is already trustworthy.

Scope:

- live platform output
- broadcast lifecycle wiring
- broadcast health signaling

Recording must already be rock solid before this phase begins.

### Phase 7 - Forge Integration

Goal: complete Bellows as a Forge-native tool.

Integrations:

- Tongs persistence
- Hammer handoff
- Quench path
- Ledger telemetry

This phase connects Bellows to canonical storage and downstream production workflows after the core Bellows runtime is stable.

## Why This Order Matters

This sequence builds Bellows from the inside out:

- Engine
- Capture
- Coordination
- UI
- Broadcast
- Ecosystem

Most tools build UI first and regret it.

## Strategic Reality Check

Bellows is positioned to be a category product, not a feature product, because it is designed as a system composed of:

- capture integrity
- operational authority
- failure survival
- pipeline integration

Very few creator tools satisfy all four.

## Implementation Recommendation

Stop expanding doctrine for its own sake.

Start writing code that obeys the doctrine.

If more design energy exists, direct it toward practical implementation artifacts:

- Bellows V1 MVP slice definition
- session engine state diagram (code-ready)
- package and file structure proposal
- build risk analysis

## One-Sentence Status

Bellows V1 canon is complete enough to build without guesswork.
