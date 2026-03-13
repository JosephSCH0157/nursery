# Bellows V1 Security And Privacy Model

This document defines the canonical Bellows security and privacy model for V1.

Purpose:

Bellows must protect:

- participants
- recordings
- credentials
- session integrity
- platform access
- user expectations of privacy

Core goal:

No participant should feel exposed by using Bellows.

## Trust Principle

Trust is not a feature add-on or a policy footnote.

Trust is a product requirement.

Creators may use Bellows for unrecoverable moments such as:

- live interviews
- breaking news
- emotional stories
- paid events
- one-time guests

Bellows must be worthy of those moments.

## Fundamental Principle

Bellows is a studio, not a surveillance system.

Bellows records only what users explicitly consent to and nothing else.

## Join Link Security

Because Bellows uses link-based invites, join links act as keys to the studio.

Join links must be:

- cryptographically strong
- non-guessable
- session-scoped
- time-limited when possible
- revocable by the Host

Recommended V1 enhancements:

- single-use tokens
- role-bound links, such as guest vs co-host
- waiting-room admission
- lock session after start

## Session Access Model

Guest entry is link-based in V1.

Guests do not need accounts.

Links should be:

- unique
- hard to guess
- scoped to one session
- optionally time-bound

## Host Control Safeguards

Host authority must be protected from hijacking.

Required protections:

- authenticated Host session
- reconnection identity verification
- protection against duplicate Host claims
- secure command channel

## Identity Model

Guests may provide:

- display name
- optional role assignment through session setup

Bellows should track participant identity internally without exposing unnecessary personal data.

## Permission Hierarchy

Security enforcement follows the session authority model, not just the UI.

Canonical hierarchy:

- Host
- Co-Host
- Guest

## Media Capture Transparency

Participants must always know:

- when recording starts
- when recording stops
- whether audio is active
- whether video is active
- whether broadcast is active

Hidden recording is never allowed.

## Explicit Recording Consent Signal

All participants must see a persistent recording indicator while recording is active.

This indicator:

- cannot be disabled
- cannot be hidden
- exists for ethical clarity and legal compliance

## Local Storage Privacy

Because Bellows is local-first, media files exist on participant devices before upload completes.

Bellows must therefore:

- store only session-related media
- avoid accessing unrelated files
- clean up temporary artifacts when appropriate
- respect browser storage boundaries

## Upload Security

Uploads must provide:

- encrypted transport
- integrity verification
- protection against tampering
- resumable authentication

Partially uploaded files must never be exposed as if they were complete artifacts.

Bellows should also preserve:

- access controls
- integrity checks
- audit trail

## Tamper Resistance

Bellows should verify:

- segment completeness
- checksum consistency
- ordering integrity

Hammer and other downstream tools should receive only validated media.

## Artifact Access Control

Only authorized users and systems may access session data.

Typical access patterns include:

- Host: full access
- workspace collaborators: only when explicitly allowed by workspace policy
- Hammer pipeline: access to capture package and artifacts
- future Quench pipeline: access to downstream outputs when appropriate

Guests must not automatically gain permanent artifact access unless that access is intentionally granted.

## Data Ownership Doctrine

The creator owns the recording.

Not Bellows.
Not the platform.
Not the browser.

Bellows acts as custodian.

## Platform Credential Protection

When Bellows links platforms such as YouTube or Rumble, it must store only necessary permissions.

Bellows must never store:

- full account credentials
- unnecessary scopes
- persistent tokens beyond actual need

Stream keys must be encrypted at rest.

## Privacy Of Studio-Only Information

Internal overlays must remain private.

This includes:

- scripts
- prompts
- warnings
- status indicators
- participant notes
- backstage controls

None of this may leak into:

- recordings
- broadcasts
- exported media
- logs exposed to others

## Chat Privacy

If Bellows ingests platform chat, it should treat chat as ephemeral input.

V1 should not permanently store audience chat unless that becomes an explicit later feature with its own consent and retention rules.

## Ejection And Removal Privacy

If the Host removes a participant:

- the removal reason should not be broadcast publicly
- the removed participant should not retain session access
- existing recordings should remain intact

## Logging Discipline

Operational logs should capture what is necessary for recovery, audit, and debugging without exposing sensitive content.

Bellows should avoid storing:

- raw audio or video data in logs
- private script text unless strictly required
- personal identifiers beyond operational need

## Data Retention Philosophy

Bellows V1 should favor:

- store only what is required to preserve the session

Bellows V1 should avoid:

- store everything just in case

## Trust Signals

Participants should feel confident that:

- they are not being secretly recorded
- their data is handled responsibly
- access is controlled
- nothing unexpected is happening

## Canonical Security Principle

Bellows must behave like a closed studio, not an open room.

## Trust Signal

At every stage, Bellows should be able to communicate in human language:

Your recording is secure.
