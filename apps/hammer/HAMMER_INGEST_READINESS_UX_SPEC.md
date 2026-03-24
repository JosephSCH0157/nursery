# HAMMER - Ingest and Readiness UX Specification

Session Entry and Preparation Communication Contract  
Derived from Forge Design Session - March 21, 2026

## Purpose

This document defines how Hammer communicates project readiness when a recording is opened.

It ensures:

- users understand what happened automatically
- no cognitive overload at session start
- no dashboard-style status clutter
- clear next steps without forcing workflow
- consistent behavior across projects
- a calm professional entry into editing

Hammer should feel like sitting down at a prepared console, not deciphering a report.

## 1. Trigger Condition

This UX sequence begins when the user selects a ready-to-edit recording from the Hammer splash page or project library.

Hammer transitions from selection to preparation.

## 2. Automatic Ingest Phase

Hammer performs preparation automatically in the background.

Typical operations include:

- transcript generation
- filler word detection
- retake detection
- audio cleanup and leveling
- visual placement suggestions
- timeline assembly
- preview preparation
- asset indexing

The exact operations may evolve, but the experience must remain consistent.

## 3. Ingest Progress Communication

During preparation, Hammer displays a progress indicator.

Requirements:

The indicator must:

- confirm that work is happening
- reduce uncertainty
- avoid technical jargon
- avoid long textual explanations
- not resemble a system diagnostic panel

A simple progress display is sufficient.

## 4. Transition to Ready State

When preparation completes, Hammer does not immediately drop the user into a blank editor.

Instead, it presents a Readiness Briefing Panel.

## 5. Readiness Briefing Panel - Purpose

The panel answers one question:

What did Hammer just do, and what is ready?

It is not:

- a settings dashboard
- a checklist the user must complete
- a permanent sidebar
- a technical log

## 6. Tone and Style

The briefing must be:

- conversational
- concise
- scan-friendly
- reassuring
- non-technical
- action-oriented

It should feel like a human assistant summarizing the situation.

## 7. Content Structure

The panel lists completed preparations in plain language.

Each item describes readiness, not process details.

Example categories:

- Transcript is ready for editing
- Images are placed on the timeline
- Audio has been polished
- Retakes and filler words are detected
- Preview is ready

Exact wording may vary, but clarity is mandatory.

## 8. Actionable Links

Items may include links that take the user directly to relevant workspace areas.

Examples:

- Edit transcript -> Transcript tab
- Review image placements -> Visual tools
- Adjust audio polish -> Audio tool panel

Links are optional but recommended.

## 9. No Required Order

The briefing does not enforce a workflow.

Users may begin wherever they choose.

Hammer assumes professional autonomy.

## 10. Panel Layout Constraints

The briefing panel must:

- occupy the central workspace area
- not cover the patch bay
- not obscure the timeline entirely
- remain visually clean
- avoid dense grids or boxes

It should not resemble a system dashboard.

## 11. Temporary Nature

This panel is transient by design.

It disappears when:

- the user clicks an action link
- the user begins editing
- the user dismisses it explicitly

Hammer does not keep reminding the user of ingest status.

## 12. No Recall Requirement

The briefing is not intended to be reopened later.

All information it conveys should be reflected in the editor itself.

Example:

Transcript readiness is obvious once the transcript is visible.

## 13. No Persistent Status Panels

Hammer must not convert readiness information into permanent widgets.

Editing space is sacred.

## 14. Immediate Editor Readiness

Once the briefing is dismissed, the full editor must be ready for use.

There should be no additional hidden loading stages.

## 15. Failure Communication

If preparation fails partially or completely:

Hammer must communicate clearly:

- what succeeded
- what failed
- whether editing can proceed
- what actions are recommended

Technical error dumps are unacceptable.

## 16. Performance Expectations

Preparation may be time-consuming, but perceived responsiveness must be maintained through progress feedback.

Users should not feel abandoned during processing.

## 17. Consistency Across Sessions

The same readiness model should apply regardless of project size or content type.

Predictability builds confidence.

## 18. Integration with Splash Page

The splash page may indicate that a recording is ready to edit, but detailed preparation results belong inside Hammer.

## 19. Relationship to Automation Philosophy

Hammer performs significant automated preparation but does not hide its outcomes.

Users should feel assisted, not overridden.

## 20. Accessibility Considerations

The briefing must be readable and navigable for users with varied abilities.

Dense visual encoding should be avoided.

## 21. Professional Mental Model Alignment

Equivalent to an engineer walking into a control room and being told:

The session is loaded. Tracks are cleaned. Levels are set. Ready when you are.

## 22. Forbidden Behaviors

Hammer must avoid:

- multi-step setup wizards
- mandatory checklists
- persistent readiness dashboards
- technical logs presented as UX
- auto-dismissal before the user sees it
- cluttered tile interfaces

## 23. Implementation Guidance for Codex/Copilot

When implementing or modifying ingest UX:

- Prioritize clarity over completeness.
- Use natural language summaries.
- Keep the panel temporary.
- Provide direct entry points into editing.
- Avoid technical detail overload.
- Do not block user autonomy.
- Preserve calm visual design.

## 24. Canonical Summary

Hammer prepares the project, then steps aside.

The readiness briefing exists only to orient the user.

Editing is the main event.

## 25. Final Principle

The user should feel that the system has prepared the workspace, not that they must configure it.
