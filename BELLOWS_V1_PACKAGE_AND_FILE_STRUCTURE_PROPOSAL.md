# BELLOWS V1 - Package and File Structure Proposal

## Purpose

Turn the recommended Bellows build sequence into a concrete repo layout that can be implemented without inventing structure on the fly.

## Current Repo Constraint

`apps/bellows` currently exists as a file containing the Bellows manifest.

Phase 0 package skeleton work therefore has one required precondition:

- convert `apps/bellows` from a file into a directory
- move the existing manifest into `apps/bellows/BELLOWS_V1_MANIFEST.md`

Without that conversion, Bellows cannot become a real workspace package under the existing `pnpm-workspace.yaml` pattern.

## Recommended Package Identity

- package name: `@forge/bellows`
- package location: `apps/bellows/`
- runtime role: Bellows application package
- shared contract extraction: defer until Bellows types stabilize

Do not prematurely split Bellows into multiple packages during Phase 0. Keep the first implementation local to `apps/bellows`.

## Recommended Phase-to-Folder Mapping

- Phase 0: package root, app shell, routing entry, build wiring
- Phase 1: `src/domain/`
- Phase 2: `src/engine/`
- Phase 3: `src/capture/`
- Phase 4: `src/connectivity/`
- Phase 5: `src/ui/`
- Phase 6: `src/broadcast/`
- Phase 7: `src/integrations/`

## Proposed Workspace Shape

```text
apps/
  bellows/
    BELLOWS_V1_MANIFEST.md
    README.md
    index.html
    package.json
    tsconfig.json
    tsconfig.app.json
    vite.config.ts
    eslint.config.js
    public/
    src/
      main.tsx
      app/
        App.tsx
        router.tsx
        routes.tsx
        providers/
          BellowsAppProviders.tsx
      domain/
        ids.ts
        primitives.ts
        roles.ts
        authority.ts
        session.ts
        participant.ts
        track.ts
        segment.ts
        broadcast.ts
        layout.ts
        script-ref.ts
        events.ts
        state.ts
        index.ts
      engine/
        actions.ts
        guards.ts
        reducer.ts
        transitions.ts
        effects.ts
        selectors.ts
        recovery.ts
        index.ts
      capture/
        devices.ts
        permissions.ts
        recorder.ts
        segmenter.ts
        local-storage.ts
        upload-queue.ts
        sync-marker.ts
      connectivity/
        signaling-client.ts
        session-channel.ts
        presence.ts
        identity-rejoin.ts
        authority-sync.ts
      broadcast/
        destinations.ts
        program-feed.ts
        platform-client.ts
        health.ts
      integrations/
        tongs/
          session-record.ts
          capture-package.ts
        hammer/
          handoff.ts
        quench/
          release-path.ts
        ledger/
          telemetry.ts
      ui/
        layout/
          StudioFrame.tsx
        components/
        screens/
          HostSetupScreen.tsx
          GreenRoomScreen.tsx
          LiveStudioScreen.tsx
          ParticipantSafeguardScreen.tsx
          GlobalSafeguardScreen.tsx
          SessionCompleteScreen.tsx
        copy/
          status-text.ts
      test-support/
        fixtures/
        builders/
        fake-clock.ts
        fake-effects.ts
    tests/
      domain/
      engine/
      capture/
      connectivity/
      broadcast/
      ui/
```

## Folder Responsibilities

### Package root

Owns package identity, Vite wiring, linting, build scripts, and Bellows-specific dev/test commands.

Recommended first scripts:

- `dev`
- `build`
- `typecheck`
- `lint`
- `test:domain`
- `test:engine`
- `test:bellows`

### `src/app/`

Contains application shell concerns only:

- router construction
- provider composition
- top-level route mounting

No domain logic should live here.

### `src/domain/`

Contains Bellows nouns and pure types:

- session model
- participant model
- roles and authority
- track and segment types
- event vocabulary
- state model

This layer must remain framework-free.

### `src/engine/`

Contains the pure session engine:

- action intake
- guards
- transition reducer
- engine-emitted effects
- selectors
- recovery logic

This is the Bellows runtime brain and should stay free of React, media APIs, and network clients.

### `src/capture/`

Owns local-first recording implementation:

- media permissions
- local recorder orchestration
- segmentation
- local artifact handling
- upload queue handoff

### `src/connectivity/`

Owns real-time coordination concerns:

- signaling
- participant presence
- authority synchronization
- reconnect identity binding

### `src/broadcast/`

Owns program feed transmission:

- platform target description
- feed output binding
- broadcast health monitoring

Keep this separate from capture so recording and broadcast remain independent pipelines.

### `src/integrations/`

Owns adapters to the rest of Forge:

- Tongs persistence
- Hammer handoff packaging
- Quench release path hooks
- Ledger telemetry emission

### `src/ui/`

Owns rendering only:

- screen composition
- visual layout
- status copy
- operator-facing components

UI should consume selectors and dispatch engine actions. It should not define business rules.

### `tests/`

Keep tests aligned to the same architectural seams:

- domain tests for invariants
- engine tests for transitions and guards
- capture tests for segment behavior
- connectivity tests for rejoin and authority behavior
- broadcast tests for failure isolation
- UI tests for state reflection, not business logic

## Recommended Phase 0 Package Payload

The first shippable package skeleton should contain only:

- package root files
- `src/main.tsx`
- `src/app/App.tsx`
- `src/app/router.tsx`
- empty route screens
- `src/domain/`
- `src/engine/`
- `tests/domain/`
- `tests/engine/`

Do not introduce media capture, signaling, or broadcasting in the initial slice.

## Recommended Future Extraction Point

If Bellows types become shared across other tools, extract stable contracts later into:

```text
packages/
  contracts/
    src/
      bellows/
```

That extraction should happen only after the app-local Bellows domain and engine have proven stable under tests.
