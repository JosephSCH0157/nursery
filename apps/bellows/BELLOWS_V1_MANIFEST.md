🔥 BELLOWS V1 MANIFEST
Remote Live Studio & Broadcast Engine

Podcaster’s Forge — Canonical Direction

🧭 Purpose

Bellows is the Forge’s live production environment for multi-location shows. It enables hosts and participants to perform together in real time while:

broadcasting directly to external platforms

capturing isolated, high-quality recordings locally

uploading assets safely to the cloud

producing deterministic session outputs for Hammer

Bellows prioritizes reliability, simplicity, and performance over granular production controls.

🎯 Scope (V1)

Bellows V1 supports conversation-based live shows with up to three on-air participants.

Supported formats include:

podcasts

interviews

panel discussions

commentary streams

educational sessions

town halls

Bellows is not designed for gaming streams, complex broadcast graphics, or multi-scene production.

🧱 Core Principles
1) Simplicity First

Bellows must be usable by non-technical hosts without training.

Open → Configure → Start → Perform → End → Done

2) Setup Before Air

All configuration occurs on a pre-show setup screen.

During the show, configuration controls are hidden or disabled.

3) Performance Lock

Once recording or broadcast begins, Bellows enters a performance-oriented mode optimized for stability and focus.

No disruptive changes may occur mid-session.

4) Host Authority

Each session is governed by a single host with full operational control.

Participants cannot continue a session independently.

5) Local Recording First

Each participant records locally at full quality.
Cloud upload occurs in the background during and after recording.

This protects against network instability and platform failures.

6) Platform Agnostic Broadcast

Bellows broadcasts to external platforms but does not host or distribute streams itself.

🛠️ Session Lifecycle
Phase 1 — Setup Mode (Host Only)

The host configures the session using a dedicated setup screen.

Setup includes:

Broadcast Targets

YouTube

Rumble

Multiple platforms simultaneously

Recording-only mode

Participants

Up to 3 on-air participants (including host)

Role assignment (Host/S1, S2, G1, G2)

Invite link generation

Saved regulars (optional)

Script Selection

Choose script from Tongs/Hearth

Optional no-script mode

Audience Prompt Feed

Enable/disable

Platform source selection

Host/co-host visibility

Device Checks

Camera preview

Microphone check

Connection readiness

Show Metadata (Optional)

Title

Description

Privacy settings

No technical streaming configuration is exposed to the user.

Phase 2 — Pre-Show Ready State

Participants join via secure link.

They must approve:

microphone access

camera access

local storage

Participants can see and hear each other before the show begins.

Status indicators confirm readiness.

Phase 3 — Live Performance Mode

Triggered by:

🔴 START LIVE SHOW

Bellows automatically:

initiates platform broadcast (if enabled)

starts local recording on all devices

begins cloud upload

plays synchronization cue

switches to performance interface

displays ON AIR state

Configuration controls are disabled.

🎙️ Studio Interface (On Air)

The live interface is minimal and stable.

Core elements:

Multi-Pane Canvas

1–3 participant layout

Automatic arrangement

Camera-off placeholders supported

Script Strip (Optional)

Subtitle-style display at bottom

Not recorded into media

Audience Prompt Highlights (Optional)

Curated messages only

Visible to host/co-host

Guests see highlighted prompts only

Not recorded into media

Persistent Status Indicators

ON AIR state

Recording active

Participant connection status

Upload safety status

👑 Host Controls During Show

Host retains essential authority:

End session

Boot participant

Highlight audience prompt

View system status

No configuration changes allowed mid-show.

💬 Audience Interaction Model

Bellows does not display public chat directly.

Instead, it supports a curated audience prompt feed:

Raw chat remains on the platform

Host/co-host see incoming messages

Individual messages can be highlighted

Guests see only highlighted prompts

Prompts are not part of recorded media

Audience interaction occurs verbally.

📡 Multi-Platform Broadcasting

Bellows can broadcast simultaneously to multiple supported platforms from a single session.

The program feed is transmitted concurrently to each destination.

External restream services are not required.

Platform latency and chat delay are governed by the platform.

🔐 Safeguard Mode

Triggered when:

host ends session

host disconnects

recording stops

participant leaves during recording

Safeguard Mode:

stops recording

continues upload of remaining data

displays progress indicator

prevents premature window closure (with warning)

confirms when it is safe to exit

👑 Host Disconnection Rule

If the host disconnects unexpectedly:

the session preserves recording continuity

a valid co-host may be promoted to acting host authority

if no co-host is available, Bellows enters degraded engine stewardship while protecting capture and upload integrity

Host return follows the current session authority rules.

📦 Session Outputs

Bellows produces deterministic assets for Hammer:

isolated audio/video per participant

role metadata

timing data

session events

sync information

completeness status

These assets are stored via Tongs.

🚫 Non-Goals (V1)

Bellows V1 does not provide:

advanced scene switching

broadcast graphics systems

complex audio routing

gaming capture tools

public chat overlays

audience video participation

large group meetings

integrated editing tools

streaming platform replacement

🧩 Role Model (V1)

On-air roles:

S1 — Host (authority)

S2 — Co-host (optional)

G1/G2 — Guests (optional)

Future backstage roles (e.g., Engineer/Producer) are reserved but not implemented.

📱 Device Support

Participants may join from desktop or mobile devices.

Mobile participation must support:

camera capture

microphone capture

local recording

background upload

🧠 Integration Within Forge

Bellows occupies the live production stage in the Forge pipeline:

Bar Stock → Hearth → Tongs → Anvil → Bellows → Hammer → Quench

🏁 V1 Definition of Success

Bellows V1 succeeds if a non-technical host can:

set up a multi-location show

go live to one or more platforms

perform without technical distractions

exit with secure, high-quality recordings

require no external broadcasting software

If you want, the next step could be:

🔥 Bellows V1 — Implementation Slice Plan
or
🔥 UI Blueprint for Setup & Studio Screens
or
🔥 Bellows ↔ Hammer Handoff Contract

But as a canonical manifest for Codex and future dev work?

✅ This is solid, scoped, and Forge-consistent.
