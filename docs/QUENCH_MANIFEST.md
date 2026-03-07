# QUENCH V1 MANIFEST

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

Status: Canonical Design Document

## Identity

Name: Quench

Role: Distribution and release engine of Podcaster's Forge

Quench is the module responsible for publishing completed workpieces to the outside world. It takes finalized media, metadata, and assets from Tongs and distributes them to external platforms and RSS feeds.

Quench performs no creative work. Its purpose is execution and delivery.

## Mission

Quench removes the time and friction required to publish creator content.

After recording, editing, and preparing a project within the Forge pipeline, Quench allows creators to release their content to multiple platforms through a single interface with minimal decisions.

North star:

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

- publishing media to external platforms
- managing release scheduling
- generating and maintaining RSS feeds
- executing platform uploads
- tracking release status
- managing distribution workflows

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

Required assets may include:

- final video export
- final audio export
- thumbnails
- episode title
- description
- tags
- SEO metadata
- transcript
- shorts/clips (optional)

All metadata is expected to be finalized prior to Quench.

## Release Packet

A release packet is the bundle of assets required to publish an episode.

Example:

```json
{
  "episode_id": "ep042",
  "title": "Episode Title",
  "description": "Episode description",
  "tags": ["podcast", "topic"],
  "video_asset": "tongs://exports/video.mp4",
  "audio_asset": "tongs://exports/audio.mp3",
  "thumbnail": "tongs://assets/thumb.jpg"
}
```

Quench assembles and deploys this packet.

## Distribution Targets

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

## Platform Adapter Architecture

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

## Publishing Modes

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

## Shorts Distribution

If shorts or clips exist in the release packet, Quench may distribute them using automated schedules.

Example cadence options:

- once per day
- twice per day
- custom interval

Shorts are drawn from assets generated earlier in the pipeline.

## A/B Testing Support

Quench may optionally support title and thumbnail testing.

If enabled:

- Quench requests additional assets from Hearth
- Hearth generates alternate titles/thumbnails
- Quench performs platform tests

This feature is optional and platform dependent.

## Hosting Model

Media hosting is determined by the workspace contract.

Possible sources include:

- local user upload
- Forge cloud hosting
- external hosting URL

Quench requires only a valid media URL or resolvable media source according to the workspace contract.

## RSS Generation

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

## Initial Setup

Users must configure platform integrations.

Typical setup steps:

- connect YouTube account
- connect Spotify account
- configure RSS settings
- configure Rumble account

This setup typically requires 10 to 15 minutes.

After configuration, publishing requires minimal input.

## Release Flow

Typical workflow:

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

Possible states:

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

These features are outside the v1 scope.

## Design Philosophy

Quench is intentionally simple and deterministic.

Creative work occurs earlier in the pipeline.

Quench focuses only on execution, reliability, and distribution.

## Forge Principle

Quench represents the final stage of the Forge metaphor.

The workpiece has been shaped.

Quench releases it into the world.
