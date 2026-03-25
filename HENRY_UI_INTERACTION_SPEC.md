# Henry UI Interaction Spec

## Surfaces
- `HenryLauncher`: persistent bottom-right entry point, low visual weight
- `HenryPanel`: non-modal side panel with context, actions, optional chat, preferences
- `HenryObservationSlot`: single-line assistive note, dismissible, never stacked

## Open/close behavior
- Panel opens only from explicit launcher/action interaction
- Panel close never auto-reopens
- Observations hidden while panel is open

## Suppression rules
- Suppress observations during:
  - active typing focus in input/textarea/contenteditable
  - recording surface (`/app/anvil`)
  - active modal/alert dialogs
  - mute window

## Quick actions
- What should I do next?
- Explain this screen
- What is optional here?
- What leads to publish?
- Show unfinished work
- Hide Henry tips
- Ask Henry

## Accessibility
- Launcher and panel controls are keyboard reachable
- Observation and panel use readable contrast
- Panel uses semantic headings and button labels
