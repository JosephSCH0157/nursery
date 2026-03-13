# Bellows V1 Studio Shell Adapter Slice

## Purpose

Define the first concrete Bellows runtime adapter implementation.

This slice makes `studio_shell` real before capture, signaling transport,
broadcast transport, or persistence infrastructure become real.

## What This Slice Proves

- A Bellows session runtime can be instantiated around the pure engine.
- Host-like commands can be dispatched without React or browser APIs.
- Studio-shell effects can be observed as concrete runtime behavior.
- Studio-shell adapter code can dispatch follow-up engine actions back into the
  Bellows runtime.
- The engine remains the authority; the adapter only reacts and feeds actions back.

## Concrete Components

- A concrete `BellowsStudioShellAdapter`
  - Handles `run_preflight_checks`
  - Handles `start_countdown`
  - Can auto-resolve preflight/countdown or hold them in manual mode
  - Emits shell observations for verification and debugging
- A `BellowsStudioShellHarness`
  - Instantiates a Bellows session runtime
  - Wires the concrete studio-shell adapter in front of no-op adapters for the
    untouched domains
  - Exposes a minimal host control surface
- A `createBellowsNoopRuntimeAdapters` utility
  - Keeps the rest of Phase Four intentionally quiet

## Phase Boundary

This is still not:

- React UI
- Media capture
- WebRTC signaling
- RTMP or live transport
- Storage or upload implementation

It is the first touchable Bellows runtime slice, not Bellows production runtime completion.
