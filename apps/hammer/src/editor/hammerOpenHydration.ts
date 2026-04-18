import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type {
  HammerHydratedLaunchContext,
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../persistence/hammerPersistenceContract";
import { buildHammerLaunchContextFromPersistence } from "../persistence/hammerPersistence";

export type HammerOpenHydrationResult = {
  launchContext: HammerLaunchContext | undefined;
  hasCanonicalBasis: boolean;
  persistenceSource: HammerHydratedLaunchContext["source"] | "bootstrap" | "none";
};

export function hydrateHammerOpenLaunchContext(args: {
  target: HammerPersistenceTarget;
  hydratedSnapshot: HammerPersistenceSnapshot | null;
  initialLaunchContext: HammerLaunchContext | undefined;
  bootstrapLaunchContext: HammerLaunchContext | undefined;
}): HammerOpenHydrationResult {
  const { target, hydratedSnapshot, initialLaunchContext, bootstrapLaunchContext } = args;
  const persistedCanonicalMissing = Boolean(
    hydratedSnapshot
    && (hydratedSnapshot.state
      || hydratedSnapshot.editor_session.data
      || hydratedSnapshot.structured_transcript.data
      || hydratedSnapshot.edit_plan.data)
    && !hydratedSnapshot.editorial_authority.data,
  );

  let launchContext = initialLaunchContext;
  let persistenceSource: HammerOpenHydrationResult["persistenceSource"] = launchContext ? "launch" : "none";

  if (hydratedSnapshot) {
    const hydrated = buildHammerLaunchContextFromPersistence(
      target,
      hydratedSnapshot,
      launchContext,
    );
    if (hydrated) {
      return {
        launchContext: hydrated.launchContext,
        hasCanonicalBasis: true,
        persistenceSource: hydrated.source,
      };
    }
  }

  if (!launchContext && bootstrapLaunchContext) {
    launchContext = bootstrapLaunchContext;
    persistenceSource = "bootstrap";
  }

  if (hydratedSnapshot && launchContext) {
    const merged = buildHammerLaunchContextFromPersistence(
      target,
      hydratedSnapshot,
      launchContext,
    );
    if (merged) {
      return {
        launchContext: merged.launchContext,
        hasCanonicalBasis: true,
        persistenceSource: merged.source,
      };
    }
  }

  return {
    launchContext,
    hasCanonicalBasis: !persistedCanonicalMissing && Boolean(launchContext),
    persistenceSource,
  };
}

