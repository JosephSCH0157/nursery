# Bellows V1 Operator Mental Model Spec

This document defines how Bellows must align with the Host's internal expectations before, during, and after a live show.

Core goal:

Bellows should feel like stepping onto a stage, not piloting a vehicle.

## The Host Is Performing, Not Operating

During a show, the Host's attention is occupied with:

- what to say next
- guest reactions
- timing
- audience engagement
- emotional tone
- technical self-consciousness

Hosts do not want to run software during performance.

Bellows must therefore behave like a silent crew member.

## The Three-Room Model

Hosts mentally move through three rooms.

Bellows should mirror this model exactly.

### Room 1: Backstage

This is setup mode.

Host mindset:

- exploratory
- analytical
- tolerant of technical detail
- accepting of minor mistakes

The UI may expose options and configuration here.

### Room 2: On Stage

This is live mode.

Host mindset:

- focused outward
- emotionally exposed
- low tolerance for surprises
- unable to debug

The UI must become calm, stable, and minimal.

### Room 3: Secure Vault

This is the post-show protection phase.

Host mindset:

- relief
- anxiety about whether it worked
- desire to leave
- desire for reassurance

The UI must communicate safety and completion.

## The Red Light Effect

Once recording starts, people feel observed.

Even experienced hosts may experience:

- performance anxiety
- time distortion
- fear of technical failure
- hyper-awareness of mistakes

Bellows must reduce this stress rather than amplify it.

## Certainty Over Control

Hosts want to know things are okay more than they want extra knobs.

Bellows should prefer:

- clear status
- passive reassurance

Bellows should avoid:

- optional complexity during live performance

## Peripheral Monitoring

Hosts glance at the interface. They do not read it closely while performing.

Important information must be understandable in under one second.

Long explanatory text is ineffective during live mode.

## Time Compression

During performance, time feels faster and multi-step actions feel harder.

Bellows should minimize multi-step tasks during live operation.

## Error Recovery Expectations

Humans assume:

"If something goes wrong, the system will handle it."

Bellows should meet that expectation whenever possible.

## Social Priority

Hosts care more about people than technology.

If Bellows must choose what to prioritize in the visible interface, it should choose:

- faces over status panels
- conversation over diagnostics

## Stable Frame Principle

Hosts anchor psychologically to the visual arrangement of the studio.

If panes jump or reflow, it feels like chaos.

Stability creates calm.

## Focus Preservation

Bellows must not steal attention unnecessarily.

Interruptions should be:

- rare
- relevant
- non-blocking when possible

## Memory Simplification

Hosts remember a simple flow:

"Click start -> do show -> click stop."

Anything beyond that increases confusion risk.

## Post-Show Anxiety Spike

After stopping, Hosts immediately worry about:

- did it record
- did we lose anything
- can I leave
- do I need to wait

Bellows must reassure them immediately.

## Canonical Mental Model Principle

Bellows is a quiet stage manager, not a co-host.

## Acceptance Criteria

This mental model is satisfied only when all of the following are true:

- a Host can focus entirely on content during live mode
- technical concerns fade into the background
- the interface feels supportive, not demanding
- post-show reassurance is immediate
- first-time users behave correctly without instruction
