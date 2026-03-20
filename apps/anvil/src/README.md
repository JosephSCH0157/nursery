This repository has been reorganized into a minimal `src/` layout to make the codebase easier to split.

Structure:

- src/core      - pure logic modules (no DOM access)
- src/ui        - DOM rendering and event wiring
- src/adapters  - adapters for external systems (OBS, recorders, storage)
- src/features  - higher-level feature bundles (script viewer, scroll logic)

This layout now boots from the TypeScript entry (`src/index.ts` -> `dist/index.js`). The legacy single-file app still exists at the project root (for reference or explicit compatibility mode), but it is no longer part of the default Anvil boot path.

Migration guidance:
1. Identify pure logic functions in `teleprompter_pro.js` and move to `src/core`.
2. Move DOM-handling code (querySelector, event listeners) to `src/ui`.
3. Break adapters into separate files in `src/adapters`.
4. Group related features into `src/features`.

The provided `index.js` is now a compatibility shim only. By default it forwards to the canonical TypeScript entry; it only routes into the legacy runtime when explicitly requested with `?legacy=1` or the equivalent boot flag.
