# Mobile V1

## Scope
- Mobile behavior is viewport-driven, not user-agent-driven.
- Layout mode is determined by `useLayoutMode()` and is one of: `mobile`, `tablet`, `desktop`.

## Navigation Pattern
- Mobile uses full-screen detail experiences for editing and focused work.
- Overlay-first is an allowed implementation strategy to avoid route churn.
- Desktop behavior remains unchanged unless explicitly redesigned.

## Execution Order
- Bar Stock mobile flow first.
- Tongs mobile flows second (Calendar, then Sessions).
- Hearth mobile flows last.

## Canonical Primitives
- Use `@forge/ui-mobile` only for mobile primitives.
- `MobilePage` and `useLayoutMode` are single-source in `packages/ui-mobile`.

## CSS Convention
- `MobilePage.tsx` imports `MobilePage.css` internally.
- Consumers must not import `MobilePage.css` directly.
- This prevents missing-style and duplicate-import drift.
