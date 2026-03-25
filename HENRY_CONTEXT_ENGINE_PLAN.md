# Henry Context Engine Plan

## Inputs
- Route and query context (`workspace_id`, `workpiece_id`)
- Global episode context from `EpisodeWorkspaceContext`
- Phase derivation from pathname mapping
- Existing display status and next-step resolver contracts

## Resolution pipeline
1. Resolve surface from pathname
2. Build canonical `HenryContext`
3. Generate context summary lines
4. Generate quick actions for surface
5. Resolve deterministic recommendation
6. Resolve optional observation candidate
7. Apply suppression and cooldown before display

## Deterministic sources
- `resolveNextEpisodeAction` remains the primary recommendation resolver
- Display status is normalized into `EpisodeStatusSignals` heuristics
- No AI required for baseline output

## Failure behavior
- Missing context: explain current screen without forced recommendation
- Inconsistent context: prefer conservative and safe guidance
- Engine failures: remain silent rather than emit invalid guidance
