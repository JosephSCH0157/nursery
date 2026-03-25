# Henry Telemetry Plan

## Event contract
Henry emits utility-only events through `track_henry_event`:
- `launcher_click`
- `panel_open`
- `quick_action`
- `next_step_shown`
- `observation_shown`
- `observation_dismissed`
- `muted`
- `freeform_asked`
- `follow_through`

## Payload discipline
- Required: workspace id, surface, event name
- Optional: workpiece id, lightweight metadata (message id, action id)
- Prohibited: freeform conversation transcripts and sensitive content payloads

## Storage
- Table: `tongs.henry_events`
- Indexed by user/workspace/time
- RLS: self + workspace-access constrained

## Success metrics
- Panel open and action engagement rates
- Recommendation usage without elevated mute rates
- Observation dismiss ratios and cooldown efficacy

## Operational rules
- Telemetry failures are non-fatal
- Event writes never block UI interactions
