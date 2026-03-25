# Henry v1 Scope Lock

## In scope
- Global launcher and panel shell across `/app/*` and active standalone tool mounts
- Deterministic context summary and quick actions
- Deterministic next-step recommendation using existing phase/status contracts
- Single observation slot with cooldown and suppression
- Preferences: show Henry, hide tips, mute window
- Durable preferences and message suppression state in Supabase
- Utility telemetry events for Henry interactions

## Out of scope
- Action execution and workflow automation
- Autoplay onboarding, modal tour flows, and forced prompts
- Mandatory chat interaction
- Cross-user/team recommendation intelligence
- Revenue or upsell logic

## Guardrails
- Pull, not push
- Never block creator work
- Respect off-switch and mute at all times
- No parallel workflow truth; read existing Forge/Tongs state only
