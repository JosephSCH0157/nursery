# QUENCH MANIFEST

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

Status: Canonical Design Document (Phase-aligned)

## Identity

Name: Quench

Role: Distribution and release engine of Podcaster's Forge

Quench is the module responsible for publishing completed workpieces to the outside world. It takes finalized media, metadata, and assets from Tongs and distributes them to external platforms and RSS feeds.

Quench performs no creative authorship. Its purpose is release decision-making, execution, and delivery. Metadata assistance may produce an uncommitted draft, but Tongs remains the authority for committed metadata.

## Mission

Quench removes the time and friction required to publish creator content.

After recording, editing, and preparing a project within the Forge pipeline, Quench allows creators to release their content to multiple platforms through a single interface with minimal decisions.

North star (long-term):

Three clicks to publish everywhere.

## Position in the Forge Pipeline

Bar Stock
-> Hearth
-> Anvil
-> Hammer
-> Tongs
-> Quench
-> Audience

Quench is the final release step in the Forge workflow.

It converts a completed workpiece into a public release.

## Core Responsibilities

Quench is responsible for:

- ingesting canonical release artifacts from Hammer/Tongs
- validating ingest readiness truthfully
- publishing media to external platforms (future slice)
- managing release scheduling (future slice)
- generating and maintaining RSS feeds (future slice)
- tracking release status and distribution workflows (future slice)

Quench orchestrates the final release packet created from Forge assets.

## Explicit Non-Responsibilities

Quench does not:

- generate scripts
- edit audio or video
- create thumbnails or graphics
- perform creative AI tasks
- manage recording sessions
- store canonical assets

All creative work must occur earlier in the pipeline.

Canonical persistence rule:

Tongs remains the canonical SSOT for persisted release state, platform connection status, receipts, schedules, and publish history. Quench may hold transient UI/runtime state, but it must not invent a second persistence authority.

## Inputs

Quench reads from Tongs, which is the canonical storage layer.

Current ingest slice assets:

- packet manifest (authority)
- transcript text artifact
- captions artifact(s)
- visual placements artifact (optional)
- canonical audio reference

Future publish slice assets may include:

- final video export
- final audio export
- thumbnails
- episode title
- description
- tags
- SEO metadata
- transcript
- shorts/clips (optional)

Metadata may be partial during ingest. Publish-specific completeness is a later readiness layer.

## Current Release Packet Contract (Hammer -> Quench Ingest)

A release packet is the canonical bundle Quench ingests first.

Current authority:

- `hammer/release-packet/manifest.v1.json`

Manifest declares the packet shape and payload references. Quench must treat manifest fields as authority and must not infer structure from filename conventions.

Current ingest verdicts:

- `Ready for publish`
- `Needs attention: audio reference unresolved`
- `Needs attention: captions missing`
- `Needs attention: transcript missing`
- `Needs attention: packet invalid`

## Canonical Release Projection

Authenticated workpieces resolve `forge.quench-release-projection.v2` through Tongs. Tongs verifies and immutably snapshots the exact Hammer manifest bytes, joins canonical metadata, and returns the active thumbnail candidate-set authority. A path or prepared-package route parameter is only a locator and cannot authorize release.

Development mock packets remain fixtures only and are never mixed into an authenticated canonical workpiece.

## Distribution Targets (Future)

Quench supports publishing to multiple external destinations.

Initial platform targets:

Video platforms:

- YouTube
- Rumble

Podcast distribution:

- Spotify
- Apple Podcasts (via RSS)
- Pocket Casts (via RSS)
- Overcast (via RSS)
- generic RSS readers

Additional platforms may be added via adapters.

## Platform Adapter Architecture (Future)

Each platform is implemented as a Quench adapter.

Example structure:

```text
/quench/adapters
    youtube.adapter.ts
    rumble.adapter.ts
    spotify.adapter.ts
    rss.adapter.ts
```

Adapters handle:

- authentication
- upload logic
- metadata formatting
- scheduling behavior
- platform response handling

This architecture allows Quench to expand without altering its core engine.

## Publishing Modes (Future)

Quench supports several release strategies.

Immediate Publish:

Content is uploaded and released immediately.

Scheduled Release:

User selects a release date and time. Quench queues the publication.

Premiere:

Supported platforms may schedule a premiere event.

Multi-Platform Release:

Episode is released simultaneously across multiple platforms.

Sequential Release:

Platforms are published in stages.

Example:

- Day 1: YouTube
- Day 2: Spotify
- Day 3: RSS

## Shorts Distribution (Future)

If shorts or clips exist in the release packet, Quench may distribute them using automated schedules.

Example cadence options:

- once per day
- twice per day
- custom interval

Shorts are drawn from assets generated earlier in the pipeline.

## A/B Testing Support (Future)

Quench may optionally support title and thumbnail testing.

If enabled, Quench receives completed immutable candidates authored by Hearth and verified through Tongs. Quench may select candidates or persist provider-neutral experiment intent, but it cannot rewrite recipes or request regeneration as part of release execution.

Provider-neutral intent is not evidence that a destination is actively rotating thumbnails. Active execution requires a capable live adapter and provider acknowledgement.

This feature is optional and platform dependent.

## Hosting Model

Media hosting is determined by the workspace contract.

Possible sources include:

- local user upload
- Forge cloud hosting
- external hosting URL

For the ingest slice, Quench requires a resolvable audio reference from the packet manifest contract.

## RSS Generation (Future)

Quench generates and maintains RSS feeds when enabled.

Example enclosure:

```xml
<enclosure
 url="https://cdn.podcastersforge.com/show/episode42.mp3"
 type="audio/mpeg"
/>
```

RSS feeds may be hosted on the Forge domain when cloud hosting is enabled.

Users may submit the RSS URL to external podcast directories.

## User Interface Model

Quench uses a three-column console layout.

Current ingest UI must prioritize:

- packet manifest status
- asset resolution status
- truthful ready/attention messaging

Future release console model:

Left column:

Episode selection. Displays available workpieces ready for release.

Center column:

Release configuration and publishing controls.

Includes:

- scheduling
- premiere options
- shorts schedule
- platform settings
- upload progress
- platform status

Right column:

Platform destinations.

Example:

- YouTube
- Rumble
- Spotify
- RSS

Users select which platforms to publish to.

Top bar:

- Quench name and version
- logged-in user
- logout control
- hamburger navigation menu

Quench does not require AI indicators.

## Initial Setup (Future)

Users must configure platform integrations.

Typical setup steps:

- connect YouTube account
- connect Spotify account
- configure RSS settings
- configure Rumble account

This setup typically requires 10 to 15 minutes.

After configuration, publishing requires minimal input.

## Release Flow

Current ingest workflow:

1. Open packet from canonical manifest path.
2. Validate packet shape.
3. Resolve audio reference and load artifacts.
4. Render truthful ready/attention state.

Future publish workflow:

1. Select episode.
2. Choose destinations.
3. Configure scheduling.
4. Execute publish.

Quench performs the remaining tasks automatically.

## Security Model

Platform credentials are stored securely within the workspace contract and protected server-side.

Authentication tokens are refreshed automatically where supported.

Sensitive credentials are never exposed to the client UI.

## Failure Handling

Quench tracks the status of each platform upload.

Current ingest states:

- ready
- attention
- invalid

Possible future publish states:

- pending
- uploading
- published
- failed

Failures provide actionable error feedback.

Users may retry individual platforms without restarting the entire release.

## Future Expansion

Possible Quench expansions include:

- automated comment moderation
- platform analytics ingestion
- social media auto-posting
- cross-platform scheduling automation
- notification systems

These features are outside the current ingest MVP scope.

## Design Philosophy

Quench is intentionally simple and deterministic.

Creative work occurs earlier in the pipeline.

Quench focuses only on execution, reliability, and distribution.

## Forge Principle

Quench represents the final stage of the Forge metaphor.

The workpiece has been shaped.

Quench releases it into the world.
