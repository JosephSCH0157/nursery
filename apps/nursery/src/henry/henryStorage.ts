import type { HenryPreferenceState } from "@forge/shared/henry";

const PREFS_KEY = "forge:henry:prefs:v1";

const DEFAULT_PREFERENCES: HenryPreferenceState = {
  showHenry: true,
  hideTips: false,
  mutedUntil: null,
  openLastTab: false,
};

type HenryPrefsCachePayload = {
  userId: string | null;
  workspaceId: string | null;
  preferences: HenryPreferenceState;
};

export function getDefaultHenryPreferences(): HenryPreferenceState {
  return { ...DEFAULT_PREFERENCES };
}

export function readCachedHenryPreferences(args: {
  userId: string | null;
  workspaceId: string | null;
}): HenryPreferenceState {
  if (typeof window === "undefined") return getDefaultHenryPreferences();
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return getDefaultHenryPreferences();
    const parsed = JSON.parse(raw) as Partial<HenryPrefsCachePayload>;
    const cachedUser = typeof parsed.userId === "string" ? parsed.userId : null;
    const cachedWorkspace = typeof parsed.workspaceId === "string" ? parsed.workspaceId : null;
    if (cachedUser !== args.userId || cachedWorkspace !== args.workspaceId) {
      return getDefaultHenryPreferences();
    }
    const preferences = parsed.preferences as Partial<HenryPreferenceState> | undefined;
    return {
      showHenry: preferences?.showHenry !== false,
      hideTips: preferences?.hideTips === true,
      mutedUntil: typeof preferences?.mutedUntil === "string" ? preferences.mutedUntil : null,
      openLastTab: preferences?.openLastTab === true,
    };
  } catch {
    return getDefaultHenryPreferences();
  }
}

export function writeCachedHenryPreferences(args: {
  userId: string | null;
  workspaceId: string | null;
  preferences: HenryPreferenceState;
}): void {
  if (typeof window === "undefined") return;
  const payload: HenryPrefsCachePayload = {
    userId: args.userId,
    workspaceId: args.workspaceId,
    preferences: args.preferences,
  };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}
