import type { HammerStudioRackState } from "./hammerStudioRack";

export type HammerNativePreviewFilter =
  | { kind: "highpass"; frequency: number }
  | { kind: "peaking" | "lowshelf" | "highshelf"; frequency: number; q: number; gain: number }
  | { kind: "compressor"; threshold: number; ratio: number; attack: number; release: number }
  | { kind: "gain"; gain: number };

export function buildHammerNativePreviewPlan(rack: HammerStudioRackState): HammerNativePreviewFilter[] {
  if (!rack.is_enabled || rack.is_bypassed) return [];
  const voice = rack.voice_polish;
  if (!voice) return [];
  const filters: HammerNativePreviewFilter[] = [];
  if (voice.voice_cleanup_enabled) {
    filters.push({ kind: "highpass", frequency: 85 });
    filters.push({ kind: "peaking", frequency: 280, q: 1.05, gain: -3.5 });
    filters.push({ kind: "peaking", frequency: 3600, q: 0.9, gain: 2.8 });
    filters.push({ kind: "compressor", threshold: -22, ratio: 3, attack: 0.01, release: 0.14 });
    filters.push({ kind: "gain", gain: 1.18 });
  }
  if (voice.fixes.reduce_room_boxiness) {
    filters.push({ kind: "peaking", frequency: 320, q: 1.1, gain: -2.7 });
  }
  if (voice.fixes.enhance_voice_clarity) {
    filters.push({ kind: "peaking", frequency: 3200, q: 1.05, gain: 2.1 });
  }
  if (voice.fixes.remove_harsh_sibilance) {
    const gain = voice.advanced.de_esser_strength === "high" ? -3 : voice.advanced.de_esser_strength === "low" ? -1.2 : -2;
    filters.push({ kind: "peaking", frequency: 6500, q: 1.2, gain });
  }
  if (voice.fixes.level_volume) {
    filters.push({ kind: "compressor", threshold: -20, ratio: 2, attack: 0.015, release: 0.16 });
    filters.push({ kind: "gain", gain: 1.08 });
  }
  if (voice.advanced.eq_profile === "voice") {
    filters.push({ kind: "peaking", frequency: 2800, q: 0.8, gain: 2.5 });
  } else if (voice.advanced.eq_profile === "bright") {
    filters.push({ kind: "highshelf", frequency: 5200, q: 0.7, gain: 4 });
  }

  const compressorModule = rack.modules.compressor;
  if (compressorModule.is_enabled && !compressorModule.is_bypassed) {
    filters.push({
      kind: "compressor",
      threshold: compressorModule.threshold_db,
      ratio: compressorModule.ratio,
      attack: compressorModule.attack_ms / 1000,
      release: compressorModule.release_ms / 1000,
    });
    filters.push({ kind: "gain", gain: 10 ** (compressorModule.makeup_gain_db / 20) });
  }
  const eqModule = rack.modules.eq;
  if (eqModule.is_enabled && !eqModule.is_bypassed) {
    filters.push({ kind: "lowshelf", frequency: eqModule.low_shelf_hz, q: 0.7, gain: eqModule.low_shelf_gain_db });
    filters.push({ kind: "peaking", frequency: eqModule.mid_hz, q: eqModule.mid_q, gain: eqModule.mid_gain_db });
    filters.push({ kind: "highshelf", frequency: eqModule.high_shelf_hz, q: 0.7, gain: eqModule.high_shelf_gain_db });
  }
  return filters;
}

type NativePreviewGraph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
};

const graphs = new WeakMap<HTMLMediaElement, NativePreviewGraph>();

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const runtime = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? runtime.webkitAudioContext ?? null;
}

export function applyHammerStudioRackNativePreview(
  element: HTMLMediaElement | null,
  rack: HammerStudioRackState,
): boolean {
  if (!element) return false;
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return false;
  let graph = graphs.get(element);
  if (!graph) {
    const context = new AudioContextConstructor();
    graph = { context, source: context.createMediaElementSource(element) };
    graphs.set(element, graph);
    element.addEventListener("play", () => { void context.resume(); });
  }

  graph.source.disconnect();
  let tail: AudioNode = graph.source;
  for (const filter of buildHammerNativePreviewPlan(rack)) {
    let node: AudioNode;
    if (filter.kind === "compressor") {
      const compressor = graph.context.createDynamicsCompressor();
      compressor.threshold.value = filter.threshold;
      compressor.ratio.value = filter.ratio;
      compressor.attack.value = filter.attack;
      compressor.release.value = filter.release;
      node = compressor;
    } else if (filter.kind === "gain") {
      const gain = graph.context.createGain();
      gain.gain.value = filter.gain;
      node = gain;
    } else {
      const eq = graph.context.createBiquadFilter();
      eq.type = filter.kind;
      eq.frequency.value = filter.frequency;
      if (filter.kind === "peaking") {
        eq.Q.value = filter.q;
        eq.gain.value = filter.gain;
      }
      node = eq;
    }
    tail.connect(node);
    tail = node;
  }
  tail.connect(graph.context.destination);
  void graph.context.resume();
  return true;
}
