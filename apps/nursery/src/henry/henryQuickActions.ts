import type { HenryQuickAction, HenryQuickActionId, HenrySurface } from "@forge/shared/henry";

export type HenryQuickActionRegistry = Record<HenrySurface, HenryQuickActionId[]>;

const QUICK_ACTION_LABELS: Record<HenryQuickActionId, string> = {
  "what-next": "What should I do next?",
  "explain-screen": "Explain this screen",
  "optional-here": "What is optional here?",
  "path-to-publish": "What leads to publish?",
  "show-unfinished": "Show unfinished work",
  "hide-tips": "Hide Henry tips",
  "ask-henry": "Ask Henry",
};

export const HENRY_QUICK_ACTION_REGISTRY: HenryQuickActionRegistry = {
  "forge-hub": ["what-next", "explain-screen", "path-to-publish", "ask-henry", "hide-tips"],
  "bar-stock": ["what-next", "explain-screen", "optional-here", "path-to-publish", "ask-henry", "hide-tips"],
  hearth: ["what-next", "explain-screen", "optional-here", "path-to-publish", "ask-henry", "hide-tips"],
  tongs: ["what-next", "explain-screen", "optional-here", "show-unfinished", "ask-henry", "hide-tips"],
  anvil: ["what-next", "explain-screen", "optional-here", "path-to-publish", "ask-henry", "hide-tips"],
  hammer: ["what-next", "explain-screen", "optional-here", "path-to-publish", "ask-henry", "hide-tips"],
  quench: ["what-next", "explain-screen", "optional-here", "show-unfinished", "ask-henry", "hide-tips"],
  ledger: ["explain-screen", "show-unfinished", "ask-henry", "hide-tips"],
  settings: ["explain-screen", "optional-here", "ask-henry", "hide-tips"],
  unknown: ["explain-screen", "ask-henry", "hide-tips"],
};

export function resolveHenryQuickActions(surface: HenrySurface): HenryQuickAction[] {
  const ids = HENRY_QUICK_ACTION_REGISTRY[surface] ?? HENRY_QUICK_ACTION_REGISTRY.unknown;
  return ids.map((id) => ({
    id,
    label: QUICK_ACTION_LABELS[id],
    enabled: true,
  }));
}
