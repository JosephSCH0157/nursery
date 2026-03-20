import type {
  BellowsEngineEffect,
  BellowsEngineEffectType,
} from "../domain/events.js";
import type { BellowsRuntimeAdapters } from "./adapters.js";
import type {
  BellowsEffectDispatchBatchContext,
  BellowsEffectDispatchReceipt,
  BellowsEffectDispatcher,
  BellowsRuntimeEffectContext,
} from "./contracts.js";
import type { BellowsBroadcastEffect } from "./broadcast.js";
import type { BellowsCaptureEffect } from "./capture.js";
import type { BellowsPersistenceEffect } from "./persistence.js";
import type { BellowsSignalingEffect } from "./signaling.js";
import type { BellowsStudioShellEffect } from "./studio-shell.js";

function withEffect<TType extends BellowsEngineEffectType>(
  effect: BellowsEngineEffect<TType>,
  context: BellowsEffectDispatchBatchContext,
): BellowsRuntimeEffectContext<TType> {
  return {
    ...context,
    effect,
  };
}

async function dispatchBellowsEffect(
  effect: BellowsEngineEffect,
  context: BellowsEffectDispatchBatchContext,
  adapters: BellowsRuntimeAdapters,
): Promise<BellowsEffectDispatchReceipt> {
  switch (effect.type) {
    case "run_preflight_checks": {
      const typedEffect = effect as BellowsStudioShellEffect<"run_preflight_checks">;
      await adapters.studioShell.runPreflightChecks(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "studio_shell",
      };
    }

    case "start_countdown": {
      const typedEffect = effect as BellowsStudioShellEffect<"start_countdown">;
      await adapters.studioShell.startCountdown(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "studio_shell",
      };
    }

    case "establish_t0": {
      const typedEffect = effect as BellowsCaptureEffect<"establish_t0">;
      await adapters.capture.establishTimebase(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "capture",
      };
    }

    case "emit_sync_marker": {
      const typedEffect = effect as BellowsCaptureEffect<"emit_sync_marker">;
      await adapters.capture.emitSyncMarker(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "capture",
      };
    }

    case "start_local_recording": {
      const typedEffect = effect as BellowsCaptureEffect<"start_local_recording">;
      await adapters.capture.startLocalRecording(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "capture",
      };
    }

    case "finalize_local_segments": {
      const typedEffect = effect as BellowsCaptureEffect<"finalize_local_segments">;
      await adapters.capture.finalizeLocalSegments(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "capture",
      };
    }

    case "start_broadcast": {
      const typedEffect = effect as BellowsBroadcastEffect<"start_broadcast">;
      await adapters.broadcast.startBroadcast(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "broadcast",
      };
    }

    case "stop_broadcast": {
      const typedEffect = effect as BellowsBroadcastEffect<"stop_broadcast">;
      await adapters.broadcast.stopBroadcast(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "broadcast",
      };
    }

    case "resume_pending_uploads": {
      const typedEffect = effect as BellowsPersistenceEffect<"resume_pending_uploads">;
      await adapters.persistence.resumePendingUploads(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "persistence",
      };
    }

    case "verify_integrity": {
      const typedEffect = effect as BellowsPersistenceEffect<"verify_integrity">;
      await adapters.persistence.verifyIntegrity(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "persistence",
      };
    }

    case "assemble_manifest": {
      const typedEffect = effect as BellowsPersistenceEffect<"assemble_manifest">;
      await adapters.persistence.assembleManifest(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "persistence",
      };
    }

    case "seal_session_record": {
      const typedEffect = effect as BellowsPersistenceEffect<"seal_session_record">;
      await adapters.persistence.sealSessionRecord(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "persistence",
      };
    }

    case "generate_invite_links": {
      const typedEffect = effect as BellowsSignalingEffect<"generate_invite_links">;
      await adapters.signaling.generateInviteLinks(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "signaling",
      };
    }

    case "promote_co_host": {
      const typedEffect = effect as BellowsSignalingEffect<"promote_co_host">;
      await adapters.signaling.promoteCoHost(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "signaling",
      };
    }

    case "enter_engine_stewardship": {
      const typedEffect = effect as BellowsSignalingEffect<"enter_engine_stewardship">;
      await adapters.signaling.enterEngineStewardship(
        typedEffect,
        withEffect(typedEffect, context),
      );
      return {
        effectType: typedEffect.type,
        adapter: "signaling",
      };
    }
  }
}

export function createBellowsEffectDispatcher(
  adapters: BellowsRuntimeAdapters,
): BellowsEffectDispatcher {
  return {
    async dispatchEffects(
      effects: readonly BellowsEngineEffect[],
      context: BellowsEffectDispatchBatchContext,
    ): Promise<readonly BellowsEffectDispatchReceipt[]> {
      const receipts: BellowsEffectDispatchReceipt[] = [];

      for (const effect of effects) {
        receipts.push(await dispatchBellowsEffect(effect, context, adapters));
      }

      return receipts;
    },
  };
}
