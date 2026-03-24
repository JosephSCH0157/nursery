# QUENCH Technical Architecture Companion

Status: Draft (Phase-aligned)

Scope: Developer-facing architecture note for Quench v1

Purpose: Define the implementation model for Quench as the Forge release engine.

## 1. Purpose

Quench is the release orchestration layer of Podcaster's Forge.

Its job is to:

- read canonical release-ready episode data from Tongs
- resolve asset location and publishability
- collect minimal user release decisions
- dispatch platform-specific publish jobs
- track status and retries
- write normalized receipts back to Tongs

Quench is not a creative system. It does not author metadata, edit media, or generate assets. It operates on assets and metadata that already exist.

## 2. System Position

Quench sits after content preparation and before downstream analytics.

Pipeline position:

Bar Stock -> Hearth -> Anvil -> Hammer -> Tongs -> Quench -> Ledger

Dependencies:

- Upstream: Tongs (canonical storage and metadata), Hammer (exports), Hearth (metadata/title/description/tags), Anvil (recording/session lineage)
- Downstream: Ledger (analytics and post-release performance)

## 3. Core Runtime Model

Quench should be implemented as a release orchestrator with four major layers:

Release Resolution Layer:

Resolves which episode/workpiece is being published and whether it is release-ready.

Decision Layer:

Collects user choices such as platform targets, publish mode, schedule, premiere settings, and shorts cadence.

Execution Layer:

Dispatches work to platform adapters and tracks progress.

Receipt Layer:

Normalizes platform outputs and writes results back to Tongs.

## 4. Canonical Data Boundaries

### 4.1 Tongs is the source of truth

Quench must never become a second metadata authority.

Canonical episode/release data lives in Tongs, including:

- workpiece identity
- episode title
- description
- tags
- SEO metadata
- transcript references
- export references
- thumbnail references
- clip/short references
- publish receipts

Quench may create platform-specific overrides, but those overrides must be written back into Tongs as structured data.

### 4.2 Quench-local state

Quench may maintain transient UI/runtime state for:

- selected episode
- selected platforms
- draft scheduling choices
- current job progress
- retry status
- temporary validation errors

This state is not canonical unless committed back to Tongs.

## 5. Phase Split: Current Ingest vs Future Publish

Quench architecture has two explicit phases:

- Current executable MVP: ingest Hammer release packets and render truthful readiness/attention state.
- Future release orchestration: platform adapters, scheduling, RSS execution, and publish receipts.

Both phases keep the same core boundary:

- manifest is authority for packet shape
- payload files are referenced artifacts
- Tongs remains canonical SSOT

### 5.1 Current Hammer Packet Contract (ingest authority)

The current packet contract is the Hammer-exported canonical bundle rooted at:

- `hammer/release-packet/manifest.v1.json`

The manifest references packet payloads:

- transcript artifact (text path)
- captions artifacts (SRT required for current Hammer export, VTT optional)
- visual placements artifact (optional at ingest)
- canonical audio authority (workpiece path/media reference fields)

Quench ingest must validate this contract directly and must not infer packet structure from filenames outside manifest references.

### 5.2 Future publish projection (deferred)

A broader publish projection (title/description/tags/thumbnail/platform overrides/shorts) remains valid architecture direction, but is out of scope for the current ingest slice.

## 6. Readiness Model (Split)

Readiness is explicitly split into ingest readiness now and publish readiness later.

### 6.1 Ingest readiness (current slice)

Quench ingest must deterministically classify:

- packet invalid
- needs attention
- ready for publish

Current ingest checks:

- manifest readable and shape-valid
- audio reference resolvable
- transcript artifact loadable
- captions present or missing (attention state, not invalid packet)
- visual placements loadable or truthfully missing (warning path)

### 6.2 Publish readiness (future slice)

Before publish execution exists, Quench will add publish readiness checks for platform metadata, thumbnails, exports, capability constraints, and schedule validity.

### 6.3 Future validation categories (publish execution)

Core identity:

- workpiece_id present
- episode_id present
- workspace_id present

Metadata:

- title present
- description present
- tags present or intentionally empty

Assets:

- thumbnail resolvable
- required media export resolvable
- media file accessible from declared source

Platform suitability:

- video exists for video platforms
- audio URL exists for RSS or Spotify flows that require it
- publish mode supported by selected adapter

### 6.4 Example publish-readiness result shape

```json
{
  "ready": false,
  "checks": {
    "title": true,
    "description": true,
    "thumbnail": false,
    "video_export": true,
    "audio_export": true
  },
  "errors": [
    {
      "code": "THUMBNAIL_MISSING",
      "message": "No thumbnail asset found for this release packet."
    }
  ]
}
```

The UI should surface readiness clearly before launch.

## 7. Asset Source Resolution

Quench must support multiple asset origins.

### 7.1 Supported source modes

`local`:

Assets live on the user machine. Quench reads from mapped local folder or file references. Publish operations may execute from the client or via staged upload.

`cloud`:

Assets live in Forge-managed cloud storage. Quench resolves public or signed URLs via backend services. This is the preferred path for Studio and future cloud users.

`external_url`:

Assets already live on a third-party host. Quench consumes the provided URL without hosting responsibility.

### 7.2 Resolution rule

The packet or associated workpiece contract must declare the expected asset source.

Quench should not guess.

Example:

```json
{
  "asset_source": "cloud"
}
```

### 7.3 Source abstraction

Implement an internal resolver interface:

```ts
interface AssetResolver {
  resolveVideo(packet: ReleasePacket): Promise<ResolvedAsset | null>;
  resolveAudio(packet: ReleasePacket): Promise<ResolvedAsset | null>;
  resolveThumbnail(packet: ReleasePacket): Promise<ResolvedAsset | null>;
  resolveShorts(packet: ReleasePacket): Promise<ResolvedAsset[]>;
}
```

This prevents platform adapters from knowing where assets came from.

## 8. Platform Adapter Architecture

Quench should use adapter modules per destination.

### 8.1 Goal

Keep platform-specific logic isolated so Quench core remains stable.

### 8.2 Suggested structure

```text
apps/quench/
  src/
    core/
      release-engine.ts
      readiness.ts
      receipt-writer.ts
      asset-resolver.ts
      job-runner.ts
    adapters/
      youtube/
        youtube.adapter.ts
        youtube.types.ts
        youtube.auth.ts
        youtube.mapper.ts
      rumble/
        rumble.adapter.ts
        rumble.types.ts
        rumble.auth.ts
        rumble.mapper.ts
      spotify/
        spotify.adapter.ts
        spotify.types.ts
        spotify.auth.ts
        spotify.mapper.ts
      rss/
        rss.adapter.ts
        rss.types.ts
        rss.renderer.ts
```

### 8.3 Adapter contract

```ts
interface QuenchPlatformAdapter {
  platform: string;
  getCapabilities(): Promise<PlatformCapabilities>;
  validate(
    packet: ReleasePacket,
    options: PlatformPublishOptions
  ): Promise<AdapterValidationResult>;
  publish(
    packet: ReleasePacket,
    options: PlatformPublishOptions,
    context: PublishContext
  ): Promise<AdapterPublishResult>;
  retry(
    receipt: PlatformReceipt,
    context: PublishContext
  ): Promise<AdapterPublishResult>;
}
```

### 8.4 Adapter responsibilities

Each adapter owns:

- platform auth/token handling hooks
- capability reporting
- payload mapping
- scheduling/premiere formatting
- execution call(s)
- response normalization
- platform-specific retry behavior

Adapters must not own canonical metadata storage.

## 9. Capability Model

Not every platform supports the same behaviors.

Quench should expose capabilities as structured flags.

### 9.1 Example capability shape

```json
{
  "platform": "youtube",
  "supports_video": true,
  "supports_audio_only": false,
  "supports_schedule": true,
  "supports_premiere": true,
  "supports_shorts": true,
  "supports_ab_testing": true
}
```

### 9.2 Why this matters

The UI should only present controls the selected platform actually supports.

Examples:

- YouTube may show premiere options.
- RSS will not.
- Shorts cadence controls should appear only if shorts exist and the platform accepts them.

## 10. Publish Job Model

Quench should treat each platform publish as a job with normalized lifecycle states.

### 10.1 Job states

Recommended states:

- pending
- validating
- queued
- uploading
- processing
- scheduled
- published
- failed
- retrying
- canceled

### 10.2 Job shape

```json
{
  "job_id": "job_001",
  "release_packet_id": "rp_001",
  "platform": "youtube",
  "state": "uploading",
  "progress": 42,
  "attempt": 1,
  "error": null
}
```

### 10.3 Execution model

For v1, Quench may run jobs serially or in a limited parallel model.

Recommended initial behavior:

- validate all selected platforms first
- dispatch publish jobs platform by platform
- allow independent success or failure per platform
- never fail the entire release because one platform failed

## 11. Local vs Cloud Execution

Quench needs dual execution support.

### 11.1 Local mode

Use when assets are local.

Possible approaches:

- browser-assisted upload
- local companion process later, if needed
- direct signed-upload handoff for staged cloud transitions

Local mode should be treated as a first-class release path, not a temporary hack.

### 11.2 Cloud mode

Use when assets are already in Forge cloud storage.

Preferred for:

- Studio accounts
- future remote recording outputs
- fully hosted RSS/media flows

Cloud mode is also the natural path for large-scale automation.

### 11.3 Contract-led behavior

Execution path should be derived from the workpiece or release contract and available asset source.

## 12. RSS Architecture

### 12.1 Ownership

Quench should generate and maintain Forge-hosted RSS feeds.

Examples:

- `https://podcastersforge.com/rss/show-slug.xml`
- `https://feeds.podcastersforge.com/show-slug.xml`

### 12.2 Feed generation model

RSS should be rendered from canonical show and episode metadata.

The feed should not be edited manually in Quench.

### 12.3 RSS requirements

A valid episode item requires:

- stable GUID
- title
- description
- publication date
- enclosure URL
- enclosure MIME type
- duration if available
- artwork and show metadata where appropriate

### 12.4 Important constraint

RSS requires publicly accessible media URLs.

That means local-only audio cannot be referenced directly in a public feed.

Forge-hosted or externally hosted audio must exist before RSS publication is considered ready.

This should be enforced during readiness validation.

## 13. Authentication and Platform Connections

Quench needs a durable platform-connection model.

### 13.1 Connection objects

Connections should be workspace-scoped or user-scoped depending on the platform model.

Suggested fields:

- connection_id
- workspace_id
- platform
- auth_type
- token metadata
- refresh metadata
- status
- created_at
- updated_at

### 13.2 Supported auth styles

- OAuth
- API key
- static credentials where unavoidable

### 13.3 Rules

- never store raw passwords unless absolutely unavoidable
- prefer OAuth or token-based auth
- keep secret material server-side
- expose only safe connection status to the UI

### 13.4 Expiration handling

If a token expires:

- mark connection degraded
- show reconnect action
- do not destroy prior configuration metadata

## 14. Platform Publish Options

Quench should separate canonical packet data from per-release decision data.

### 14.1 Example publish options shape

```json
{
  "platforms": {
    "youtube": {
      "enabled": true,
      "mode": "premiere",
      "scheduled_for": "2026-03-15T19:00:00Z"
    },
    "spotify": {
      "enabled": true,
      "mode": "schedule",
      "scheduled_for": "2026-03-15T19:05:00Z"
    },
    "rss": {
      "enabled": true,
      "mode": "publish"
    }
  },
  "shorts_strategy": {
    "enabled": true,
    "cadence": "daily"
  }
}
```

These choices should be persistable as a draft if desired, but persisted drafts remain Tongs-owned data.

## 15. Release Receipts

Every publish action should generate normalized receipts.

### 15.1 Goal

Receipts provide canonical evidence of what happened.

### 15.2 Receipt contents

Suggested fields:

- platform
- external_id
- external_url
- published_at
- scheduled_for
- status
- payload summary
- raw adapter metadata snapshot
- retry count

### 15.3 Example

```json
{
  "platform": "youtube",
  "external_id": "yt_abc123",
  "external_url": "https://youtube.com/watch?v=abc123",
  "status": "published",
  "published_at": "2026-03-07T15:20:00Z"
}
```

### 15.4 Storage

Receipts should be written back to Tongs as part of the workpiece release history.

## 16. Retry and Failure Strategy

Quench must be resilient to partial failure.

### 16.1 Rule

A release is not all-or-nothing.

If YouTube succeeds and Rumble fails, YouTube remains published and Rumble can be retried independently.

### 16.2 Error normalization

Adapters should map platform errors to Quench-facing categories.

Suggested categories:

- auth_error
- validation_error
- upload_error
- rate_limit
- unsupported_option
- remote_platform_error
- unknown_error

### 16.3 User-facing recovery

The UI should present actionable retry controls like:

- reconnect platform
- retry upload
- remove unsupported option
- re-resolve missing asset

## 17. A/B Variant Request Flow

Quench does not generate variants itself.

If a user requests title or thumbnail testing:

- Quench validates platform support
- Quench creates a variant request
- Hearth generates variant candidates
- Tongs stores them
- Quench refreshes packet projection
- Quench publishes using the selected test-capable adapter path

### 17.1 Variant request shape

```json
{
  "request_type": "ab_variant_request",
  "episode_id": "ep_001",
  "need_titles": 2,
  "need_thumbnails": 2,
  "target_platform": "youtube"
}
```

This preserves role boundaries.

## 18. UI Architecture Notes

### 18.1 Page model

Quench should be a standalone Forge page with the standard hamburger menu and simple top bar.

Top bar contents:

- module name and version
- logged-in user identity
- logout

No AI indicators are needed.

### 18.2 Three-column layout

Left column:

- publishable episodes or workpieces
- readiness badges
- optional release history tab later

Center column:

- episode overview
- readiness summary
- release strategy controls
- launch button
- live execution and progress board

Right column:

- platform list
- platform-specific controls rendered by capability

### 18.3 UX principle

Quench should feel like a release console, not a generic dashboard.

## 19. Suggested Service Boundaries

### 19.1 Quench core services

Suggested modules:

- release-packet.service
- readiness.service
- asset-resolution.service
- connection.service
- publish-orchestrator.service
- receipt.service
- rss.service

### 19.2 Backend responsibilities

Backend services should handle:

- credential protection
- token refresh
- signed URL generation
- cloud-mode publish execution
- feed rendering
- receipt persistence

### 19.3 Frontend responsibilities

Frontend should handle:

- selection and configuration UI
- status rendering
- launch initiation
- safe polling or subscription for job progress

## 20. Queueing and Background Work

Quench publish operations may require queue-backed execution even in v1 if uploads are not instantaneous.

Recommended model:

- create release job set
- enqueue per-platform job entries
- stream or poll state back to UI
- persist final receipts

Future cloud-native operation should support long-running execution without requiring the browser to remain open.

## 21. Security and Compliance Notes

Quench handles sensitive integrations and must treat them accordingly.

Rules:

- secrets server-side only
- signed URLs for cloud asset access where possible
- least-privilege scopes when connecting platforms
- audit publish actions in Tongs event history
- separate user-facing error text from raw provider error blobs

## 22. Eventing and Audit Trail

Quench actions should write structured events back to Tongs.

Examples:

- release_requested
- readiness_failed
- publish_started
- platform_published
- platform_failed
- release_completed
- release_partially_completed

These events become the operational trail for debugging, support, and Ledger integration.

## 23. MVP Boundary

Current executable MVP should include:

- ingest Hammer release packet from Tongs/canonical artifact paths
- discover and read manifest
- validate manifest shape
- resolve canonical audio reference
- load transcript/captions/visual placements
- render truthful state:
  - Ready for publish
  - Needs attention: audio reference unresolved
  - Needs attention: captions missing
  - Needs attention: transcript missing
  - Needs attention: packet invalid

Current executable MVP should exclude:

- platform adapters
- scheduling
- RSS execution
- connection/auth setup
- publish orchestration
- publish receipts

Future Quench v1+ release orchestration may include:

- episode selection from Tongs
- manual platform selection
- YouTube adapter
- Rumble adapter
- Spotify adapter
- RSS feed generation and update
- basic schedule support
- publish status board
- platform connection setup
- receipt persistence

All future slices should continue to exclude:

- social autoposting
- advanced analytics dashboards
- comment automation
- broad marketing campaign tooling
- full thumbnail or image editing
- complex queue dashboards

## 24. Long-Term Direction

Future Quench evolution may include:

- release templates
- coordinated release campaigns
- shorts drip scheduling engine
- platform-specific override editor
- automated post-release notifications
- analytics ingestion hooks into Ledger
- public website or podcast page generation

These should be added without compromising the core rule:

Quench assembles, executes, and records releases. It does not become a creative workspace.

## 25. Canonical Implementation Principle

If there is ever ambiguity about whether logic belongs in Quench, apply this rule:

If it creates or reshapes content, it probably belongs upstream.

If it executes delivery of already-created content, it belongs in Quench.

This rule should remain the primary anti-scope-creep safeguard.
