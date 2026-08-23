import { createHash } from 'crypto';
import { parseRequestedPresentation } from '../../src/script/performance-presentation-boundary';
import { PerformancePresentationAuthority } from '../../src/script/performance-presentation-installer';
import { observeCommittedPresentationMutations } from '../../src/script/performance-presentation-mirror-observer';
import {
  coordinateStagedPerformanceApply,
  createStagedPerformanceApply,
  PERFORMANCE_DISPLAY_POLICY,
  PerformanceApplyCoordinatorError,
  type PerformanceApplyStageFault,
  type PerformanceRuntimeCommit,
} from '../../src/script/performance-apply-coordinator';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    randomUUID: () => '33333333-3333-4333-8333-333333333333',
    subtle: { digest: async (_algorithm: string, data: ArrayBuffer) => Uint8Array.from(createHash('sha256').update(new Uint8Array(data)).digest()).buffer },
  },
});

const encoder = new TextEncoder();
const TEXT = '[s1]\nOne short line\ncontinues here.\n\nA second block.\n[/s1]\n';
const BYTES = encoder.encode(TEXT);
const SOURCE = {
  workspaceId: '11111111-1111-4111-8111-111111111111', workpieceId: '22222222-2222-4222-8222-222222222222',
  path: 'script/script.md', scriptRevision: 7, scriptHash: createHash('sha256').update(BYTES).digest('hex'), readyTransitionId: null,
};
const REQUESTED = parseRequestedPresentation('?presentation=performance-projection-v1');

type RuntimeState = {
  raw: string;
  revision: number;
  activeProjectionId: string | null;
  rawDisplayPublications: number;
};

function harness(overrides: { requested?: typeof REQUESTED; authenticated?: boolean; scrollMode?: string } = {}) {
  document.body.innerHTML = '<div id="script" data-legacy="yes"><div id="legacy">Legacy presentation</div></div>';
  const root = document.getElementById('script')!;
  const authority = new PerformancePresentationAuthority(SOURCE);
  const runtime: RuntimeState = { raw: 'legacy raw', revision: 6, activeProjectionId: null, rawDisplayPublications: 0 };
  const snapshots: RuntimeState[] = [];
  const commits: PerformanceRuntimeCommit[] = [];
  const restores: RuntimeState[] = [];
  const events: unknown[] = [];
  const mirrors: string[] = [];
  const observer = observeCommittedPresentationMutations(root, () => mirrors.push(root.innerHTML));
  const stage = createStagedPerformanceApply({
    requestedPresentation: overrides.requested ?? REQUESTED,
    authenticated: overrides.authenticated ?? true,
    source: 'workpiece-handoff',
    canonicalIdentity: SOURCE,
    canonicalText: TEXT,
    canonicalUtf8Bytes: BYTES,
    scrollMode: overrides.scrollMode ?? 'step',
    presentationGeneration: authority.generation,
  });
  const adapters = {
    runtime: {
      snapshot: () => {
        const snapshot = { ...runtime };
        snapshots.push(snapshot);
        return snapshot;
      },
      commit: (value: PerformanceRuntimeCommit) => {
        commits.push(value);
        runtime.raw = value.canonicalText;
        runtime.revision = value.canonicalIdentity.scriptRevision;
        runtime.activeProjectionId = value.activePresentation?.projection.projectionId ?? null;
        // Projection policy deliberately has no raw-display publication operation.
      },
      restore: (snapshot: RuntimeState) => {
        restores.push(snapshot);
        Object.assign(runtime, snapshot);
      },
    },
    events: { publishProjectionCommitted: (detail: unknown) => events.push(detail) },
  };
  return { root, authority, runtime, snapshots, commits, restores, events, mirrors, observer, stage, adapters };
}

describe('HA-4D1 staged apply coordinator', () => {
  test('commits runtime, active receipt, one rendered mirror, and one projection event without raw publication', async () => {
    const state = harness();
    const result = await coordinateStagedPerformanceApply({
      stage: state.stage, authority: state.authority, root: state.root, adapters: state.adapters,
    });
    await Promise.resolve();
    state.observer.disconnect();
    expect(result.outcome).toBe('projection-committed');
    expect(state.runtime.raw).toBe(TEXT);
    expect(state.runtime.revision).toBe(7);
    expect(state.runtime.activeProjectionId).toMatch(/^[0-9a-f]{64}$/);
    expect(state.runtime.rawDisplayPublications).toBe(0);
    expect(state.commits).toHaveLength(2);
    expect(state.commits[0]!.activePresentation).toBeNull();
    expect(state.commits[1]!.activePresentation).not.toBeNull();
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toEqual(expect.objectContaining({
      schema: 'anvil.performance-presentation-committed.v1', displayPolicy: PERFORMANCE_DISPLAY_POLICY,
    }));
    expect(state.mirrors).toHaveLength(1);
    expect(state.mirrors[0]).toContain('tp-performance-block');
  });

  test('legacy selection bypasses every coordinator adapter and leaves legacy state unchanged', async () => {
    const current = parseRequestedPresentation('?workspace_id=anything');
    const state = harness({ requested: current as typeof REQUESTED });
    const before = state.root.outerHTML;
    const result = await coordinateStagedPerformanceApply({
      stage: state.stage, authority: state.authority, root: state.root, adapters: state.adapters,
    });
    await Promise.resolve();
    state.observer.disconnect();
    expect(result).toEqual({ outcome: 'legacy-bypass', displayPolicy: 'legacy-unchanged' });
    expect(state.snapshots).toEqual([]);
    expect(state.commits).toEqual([]);
    expect(state.restores).toEqual([]);
    expect(state.events).toEqual([]);
    expect(state.mirrors).toEqual([]);
    expect(state.root.outerHTML).toBe(before);
  });

  test.each(['asr', 'hybrid'])('rejects unsupported %s mode before preparation or mutation', async (scrollMode) => {
    const state = harness({ scrollMode });
    await expect(coordinateStagedPerformanceApply({
      stage: state.stage, authority: state.authority, root: state.root, adapters: state.adapters,
    })).rejects.toMatchObject({ code: 'ASR_SCROLL_MODE_UNSUPPORTED', stage: 'eligibility' });
    state.observer.disconnect();
    expect(state.snapshots).toEqual([]);
    expect(state.root.querySelector('#legacy')).not.toBeNull();
  });

  test('rejects unauthenticated input before preparation or mutation', async () => {
    const state = harness({ authenticated: false });
    await expect(coordinateStagedPerformanceApply({
      stage: state.stage, authority: state.authority, root: state.root, adapters: state.adapters,
    })).rejects.toBeInstanceOf(PerformanceApplyCoordinatorError);
    state.observer.disconnect();
    expect(state.snapshots).toEqual([]);
    expect(state.root.querySelector('#legacy')).not.toBeNull();
  });

  test('generation changes during asynchronous staging reject before installation', async () => {
    const state = harness();
    await expect(coordinateStagedPerformanceApply({
      stage: state.stage, authority: state.authority, root: state.root, adapters: state.adapters,
      fault: (stage) => {
        if (stage === 'after-prepare') {
          state.authority.invalidateForScriptGeneration({ ...SOURCE, scriptRevision: 8, scriptHash: 'a'.repeat(64) });
        }
      },
    })).rejects.toMatchObject({ code: 'PRESENTATION_GENERATION_STALE', stage: 'after-prepare' });
    state.observer.disconnect();
    expect(state.snapshots).toEqual([]);
    expect(state.authority.prepared).toBeNull();
    expect(state.authority.active).toBeNull();
    expect(state.root.querySelector('#legacy')).not.toBeNull();
  });

  test.each<PerformanceApplyStageFault>([
    'before-prepare', 'after-prepare', 'after-build', 'before-runtime-snapshot',
    'installer-after-replace', 'installer-before-receipt', 'after-runtime-commit', 'before-committed-event',
  ])('fails atomically at injected stage %s', async (faultStage) => {
    const state = harness();
    const before = state.root.outerHTML;
    await expect(coordinateStagedPerformanceApply({
      stage: state.stage, authority: state.authority, root: state.root, adapters: state.adapters,
      fault: (stage) => { if (stage === faultStage) throw new Error(`injected:${stage}`); },
    })).rejects.toMatchObject({ code: 'COORDINATED_APPLY_FAILED', stage: faultStage });
    await Promise.resolve();
    state.observer.disconnect();
    expect(state.root.outerHTML).toBe(before);
    expect(state.authority.active).toBeNull();
    expect(state.events).toEqual([]);
    expect(state.mirrors).toEqual([]);
    expect(state.runtime).toEqual({ raw: 'legacy raw', revision: 6, activeProjectionId: null, rawDisplayPublications: 0 });
    if (faultStage === 'after-runtime-commit' || faultStage === 'before-committed-event') {
      expect(state.restores).toHaveLength(1);
    }
  });

  test('staged bytes and identity are immutable copies of caller input', () => {
    const bytes = Uint8Array.from(BYTES);
    const identity = { ...SOURCE };
    const authority = new PerformancePresentationAuthority(identity);
    const stage = createStagedPerformanceApply({
      requestedPresentation: REQUESTED, authenticated: true, source: 'ready-script', canonicalIdentity: identity,
      canonicalText: TEXT, canonicalUtf8Bytes: bytes, scrollMode: 'step', presentationGeneration: authority.generation,
    });
    bytes[0] = 0;
    identity.scriptRevision = 99;
    expect(stage.canonicalUtf8Bytes[0]).toBe(BYTES[0]);
    expect(stage.canonicalIdentity.scriptRevision).toBe(7);
    expect(Object.isFrozen(stage)).toBe(true);
    expect(Object.isFrozen(stage.canonicalUtf8Bytes)).toBe(true);
  });
});
