# Bellows V1 Live Platform Integration Note

This document defines how Bellows integrates with external live platforms in V1.

It answers how Bellows:

- starts live broadcasts
- sends audio/video to platforms
- receives audience chat, optionally
- supports multi-destination streaming
- remains a studio, not a hosting service

Bellows is the control room and production truck.
YouTube, Rumble, and similar services are the transmitters.

## Prime Directive

Broadcasting must never endanger recording.

Streaming is expendable.
Capture is sacred.

## Ownership Model

Bellows owns:

- studio composition
- participant feeds
- mixing and scene output
- broadcast initiation
- stream health monitoring
- optional chat ingestion
- local recording, always

Platforms own:

- CDN distribution
- public playback
- audience accounts
- monetization
- moderation
- chat storage
- stream archiving on the platform side

Bellows never assumes platform reliability.

## Account Linking

Before a live show can target a platform, the host must link accounts.

Supported V1 methods:

### OAuth

Preferred when supported.

The user signs in to:

- YouTube
- Rumble
- future supported platforms

Bellows receives broadcast permissions only.

### Stream Key

Fallback for platforms without OAuth.

The user provides:

- RTMP URL
- stream key

These credentials must be stored securely in Tongs using encrypted storage.

## Setup Screen Behavior

All configuration happens on the setup screen.

The host selects:

- live or record-only mode
- target platforms
- participants
- script reference
- optional show metadata
- multi-stream toggle
- recording quality

Once the host selects Start Recording or Go Live, no further setup should be required.

## Broadcast Pipeline

Bellows produces a Program Feed, which is the composed output of the studio.

Conceptual flow:

```text
Participant Feeds
      ↓
Studio Composition
      ↓
Program Output
      ↓
RTMP/WebRTC Push
      ↓
Platforms
```

Local recording continues regardless of broadcast success.

## Dual Pipeline Model

Bellows runs two independent systems:

Recording pipeline:

- local -> cloud -> Hammer

Broadcast pipeline:

- live mix -> platform

Failure of one pipeline must not automatically kill the other.

## Multi-Platform Streaming

Bellows V1 may broadcast to multiple platforms simultaneously.

### Direct Multi-Push

Preferred V1 strategy.

Bellows sends independent streams to each platform.

Pros:

- no third-party dependency
- full control
- lower latency

Cons:

- more bandwidth required
- more CPU/GPU load

### Relay Service

Future option only.

Bellows sends once to a relay or restream node, which distributes outward.

This is not required for V1.

### Practical V1 Path

Bellows may use a single output to an external relay where operationally appropriate.

Native parallel multi-platform output remains a future expansion path.

## Recording Independence

If live streaming fails:

- local recordings continue
- upload pipeline continues
- the session capture package is still produced

Bellows prioritizes the master recording over the live broadcast.

## Audience Chat Integration

Bellows does not host chat.

Bellows may ingest platform chat as an optional input stream.

V1 properties:

- platform-delay-agnostic
- visible only to host/co-host
- highlightable for talent
- not recorded into media
- not persisted in Tongs

This should behave like producer IFB, not a public audience display.

## Stream Health Monitoring

Bellows tracks:

- connection status
- bitrate stability
- dropped frames
- platform acknowledgments
- disconnection events

If a platform drops, Bellows should warn the host and continue local recording.

## Bandwidth Adaptation

Broadcast quality may adapt dynamically when needed.

Recording quality must not downshift merely because broadcast conditions degrade.

## Broadcast Lifecycle

### Pre-Live

- accounts verified
- stream endpoints prepared
- countdown, optional
- sync tone or clap, if enabled

### Live

- program feed active
- chat ingestion active, optional
- recording active
- upload staging active

### Post-Live

When the host ends broadcast:

- platforms stop receiving the stream
- recording continues until session end
- upload completes
- session seals

## Explicit Non-Responsibilities

Bellows V1 does not:

- host viewer playback
- store public chat
- manage subscriptions or monetization
- moderate audiences
- guarantee platform uptime
- replace platform dashboards

Bellows replaces OBS or Riverside as the studio tool. It does not replace the platforms themselves.

## Failure Scenarios

### Platform Crash

Broadcast stops. Recording continues.

### Internet Instability

Use adaptive bitrate if possible. Otherwise, warn and continue local capture.

## Latency Doctrine

Bellows prioritizes stability over ultra-low latency.

Creators generally care more about reliability than shaving milliseconds from viewer delay.

### Host Disconnects

Broadcast ends or pauses depending on platform behavior, while Bellows session recovery rules still apply.

## Privacy And Control

Platforms receive only the program feed.

Bellows must not send:

- script overlays
- talent warnings
- internal UI
- participant control panels
- upload indicators
- studio chat prompts

Studio overlays are not part of either the recorded or broadcast signal.

## Canonical Design Principle

Bellows is a studio that can transmit, not a platform that hosts.

## V1 Completion Criteria

Bellows live integration is functional only when all of the following are true:

- host can link at least one platform
- program feed can be broadcast
- local recording continues independently
- multi-platform broadcast is optional
- broadcast failures do not corrupt session capture

## Structural Beam Summary

The Bellows architecture now has three core external seams:

- Bellows -> Hammer: deterministic edit-ready capture packages
- Bellows -> Tongs: canonical storage and lifecycle
- Bellows -> Platforms: live transmission from the Bellows studio

This defines Bellows as a remote production system with:

- studio control
- multicam capture
- cloud-assisted ingest
- live broadcast
- edit pipeline integration
- creator-controlled workflow
