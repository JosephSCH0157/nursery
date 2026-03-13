# Bellows V1 Interaction Hierarchy

This document defines the canonical visibility hierarchy for Bellows V1, especially during live mode.

Purpose:

Critical information must remain visible, while non-critical controls must stay out of the operator's way.

## Always Visible During Live

The following elements must remain visible during live mode:

- participant panes
- recording indicator
- essential session status
- script strip, if enabled
- highlighted prompts

These elements represent the minimum live-performance surface.

## Contextual Or Hidden During Live

The following elements must be contextual, hidden, or removed from the primary live surface:

- setup controls
- advanced diagnostics
- account settings
- configuration options

These concerns may exist elsewhere, but they must not compete with the live-performance surface.

## Hierarchy Rule

Bellows must preserve a strict hierarchy:

1. performance-critical visibility
2. safety-critical visibility
3. contextual operational controls
4. hidden or deferred configuration

Live mode should never allow lower-priority UI to displace higher-priority session truth.
