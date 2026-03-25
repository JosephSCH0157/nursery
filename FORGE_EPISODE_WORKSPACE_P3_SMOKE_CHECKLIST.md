# Forge Episode Workspace P3 Smoke Checklist

## Active Episode Flows

- Hearth: open an episode with workpiece context and confirm the workspace header shows the episode title, phase stepper, and normalized status language.
- Hearth: confirm the primary action reads Start Recording and preserves workspace and workpiece route context.
- Hammer: open an episode from a valid handoff and confirm the workspace header remains visible through editor navigation.
- Bellows: open with workpiece context and confirm the workspace header appears above the standalone shell without breaking host controls.
- Anvil: launch from Hearth and confirm the recording transition screen shows the compact episode continuity strip before redirect.
- Quench: open from Hammer release prep and confirm the release header shows the compact episode continuity strip and release handoff banner.

## No-Context And Missing-Artifact States

- Hearth direct entry without workpiece context: confirm the app still renders and no episode header appears.
- Bellows direct entry without workpiece context: confirm the shell loads normally and no continuity strip appears.
- Anvil invalid handoff: confirm the screen says Unable to start recording, explains the next step in product language, and offers Go to Recording home.
- Quench invalid prepared-release handoff: confirm the banner explains the issue in release language instead of raw parameter names.

## Context Preservation

- Click each phase in the episode stepper from Hearth, Hammer, and Bellows and confirm workspace_id and workpiece_id stay present in the destination route.
- Use Continue Workflow when available and confirm the destination matches the expected next phase without losing title or episode identity.

## Narrow Layout

- At tablet width, confirm the workspace layer keeps the current phase visible and does not overflow horizontally.
- At mobile width, confirm the episode header hides lower-priority metadata before breaking layout.
- In Quench and Anvil continuity strips, confirm the title wraps cleanly and the status pill remains readable.

## DEV Overlay

- In DEV, confirm the overlay shows episodeId, title, status, source, and current pathname.
- Navigate across Hearth, Hammer, Bellows, Anvil, and Quench and confirm the overlay keeps the same episode identity unless the route changes to a different workpiece.