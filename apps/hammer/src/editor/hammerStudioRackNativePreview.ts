import type { HammerStudioRackState } from "./hammerStudioRack";
import { buildHammerAudioDspPlan } from "./hammerAudioDspPlan";

export type HammerNativePreviewFilter =
  | { kind: "highpass"; frequency: number }
  | { kind: "peaking" | "lowshelf" | "highshelf"; frequency: number; q: number; gain: number }
  | { kind: "compressor" | "gate" | "limiter"; threshold: number; ratio: number; attack: number; release: number }
  | { kind: "gain"; gain: number }
  | { kind: "noise_reduction"; amount: number }
  | { kind: "waveshaper"; amount: number }
  | { kind: "reverb"; mix: number; decaySec: number; predelayMs: number; seed: string };

function numberParam(parameters: Readonly<Record<string, string | number | boolean>>, key: string, fallback = 0): number {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildHammerNativePreviewPlan(rack: HammerStudioRackState): HammerNativePreviewFilter[] {
  const filters: HammerNativePreviewFilter[] = [];
  for (const operation of buildHammerAudioDspPlan(rack).operations) {
    if (!operation.enabled || operation.bypassed) continue;
    const p = operation.parameters;
    switch (operation.id) {
      case "input_gain": filters.push({ kind: "gain", gain: 10 ** (numberParam(p, "gain_db") / 20) }); break;
      case "highpass_cleanup": filters.push({ kind: "highpass", frequency: numberParam(p, "frequency_hz", 80) }); break;
      case "noise_reduction": filters.push({ kind: "noise_reduction", amount: numberParam(p, "amount", 0.18) }); break;
      case "gate": filters.push({ kind: "gate", threshold: numberParam(p, "threshold_db", -52), ratio: 20, attack: numberParam(p, "attack_ms", 12) / 1000, release: numberParam(p, "release_ms", 220) / 1000 }); break;
      case "corrective_eq": filters.push({ kind: "peaking", frequency: numberParam(p, "frequency_hz", 320), q: numberParam(p, "q", 1.1), gain: numberParam(p, "gain_db", -2.7) }); break;
      case "de_esser": filters.push({ kind: "peaking", frequency: numberParam(p, "frequency_hz", 6500), q: 1.2, gain: p.strength === "high" ? -4 : p.strength === "low" ? -1.5 : -2.5 }); break;
      case "compression_level": filters.push({ kind: "compressor", threshold: numberParam(p, "threshold_db", -22), ratio: numberParam(p, "ratio", 2), attack: numberParam(p, "attack_ms", 12) / 1000, release: numberParam(p, "release_ms", 160) / 1000 }, { kind: "gain", gain: 10 ** (numberParam(p, "makeup_gain_db") / 20) }); break;
      case "tonal_eq": filters.push(
        { kind: "lowshelf", frequency: numberParam(p, "low_hz", 120), q: 0.7, gain: numberParam(p, "low_gain_db") },
        { kind: "peaking", frequency: numberParam(p, "mid_hz", 3200), q: numberParam(p, "mid_q", 1), gain: numberParam(p, "mid_gain_db") },
        { kind: "highshelf", frequency: numberParam(p, "high_hz", 9800), q: 0.7, gain: numberParam(p, "high_gain_db") },
      ); break;
      case "tube_saturation": filters.push({ kind: "lowshelf", frequency: 180, q: 0.7, gain: numberParam(p, "warmth") * 2.5 }, { kind: "highshelf", frequency: 8000, q: 0.7, gain: numberParam(p, "air") * 2 }, { kind: "waveshaper", amount: numberParam(p, "amount") }); break;
      case "reverb": filters.push({ kind: "reverb", mix: numberParam(p, "mix"), decaySec: numberParam(p, "decay_sec", 0.55), predelayMs: numberParam(p, "predelay_ms", 12), seed: String(p.seed ?? "hammer-reverb") }); break;
      case "loudness_normalization": filters.push({ kind: "compressor", threshold: -18, ratio: 1.6, attack: 0.02, release: 0.18 }, { kind: "gain", gain: 1.08 }); break;
      case "output_limiter": filters.push({ kind: "limiter", threshold: numberParam(p, "ceiling_dbfs", -1.5), ratio: 20, attack: 0.002, release: 0.08 }); break;
    }
  }
  return filters;
}

type NativePreviewGraph = { context: AudioContext; source: MediaElementAudioSourceNode; beforeGain: GainNode; afterInput: GainNode; afterOutput: GainNode; master: GainNode; replaceableNodes: AudioNode[] };
const graphs = new WeakMap<HTMLMediaElement, NativePreviewGraph>();

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const runtime = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? runtime.webkitAudioContext ?? null;
}

function seededUnit(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; };
}

export function buildDeterministicReverbImpulse(context: BaseAudioContext, args: { decaySec: number; seed: string }): AudioBuffer {
  const frames = Math.max(1, Math.round(context.sampleRate * Math.max(0.05, Math.min(4, args.decaySec))));
  const buffer = context.createBuffer(2, frames, context.sampleRate); const random = seededUnit(args.seed);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) { const data = buffer.getChannelData(channel); for (let index = 0; index < frames; index += 1) data[index] = ((random() * 2) - 1) * ((1 - (index / frames)) ** 2); }
  return buffer;
}

function createGraph(element: HTMLMediaElement, Context: typeof AudioContext): NativePreviewGraph {
  const context = new Context(); const source = context.createMediaElementSource(element); const beforeGain = context.createGain(); const afterInput = context.createGain(); const afterOutput = context.createGain(); const master = context.createGain();
  source.connect(beforeGain); beforeGain.connect(master); source.connect(afterInput); afterOutput.connect(master); master.connect(context.destination);
  element.addEventListener("play", () => { void context.resume(); });
  return { context, source, beforeGain, afterInput, afterOutput, master, replaceableNodes: [] };
}

function connectFilter(graph: NativePreviewGraph, tail: AudioNode, filter: HammerNativePreviewFilter): AudioNode {
  let node: AudioNode;
  if (filter.kind === "compressor" || filter.kind === "gate" || filter.kind === "limiter") { const compressor = graph.context.createDynamicsCompressor(); compressor.threshold.value = filter.threshold; compressor.ratio.value = filter.ratio; compressor.attack.value = filter.attack; compressor.release.value = filter.release; node = compressor; }
  else if (filter.kind === "gain") { const gain = graph.context.createGain(); gain.gain.value = filter.gain; node = gain; }
  else if (filter.kind === "waveshaper") { const shaper = graph.context.createWaveShaper(); const amount = Math.max(0, Math.min(1, filter.amount)); const curve = new Float32Array(2048); for (let i = 0; i < curve.length; i += 1) { const x = ((i / (curve.length - 1)) * 2) - 1; curve[i] = Math.tanh(x * (1 + amount * 5)) / Math.tanh(1 + amount * 5); } shaper.curve = curve; shaper.oversample = "4x"; node = shaper; }
  else if (filter.kind === "reverb") { const merger = graph.context.createGain(); const dry = graph.context.createGain(); const wet = graph.context.createGain(); const delay = graph.context.createDelay(1); const convolver = graph.context.createConvolver(); dry.gain.value = 1 - filter.mix; wet.gain.value = filter.mix; delay.delayTime.value = filter.predelayMs / 1000; convolver.buffer = buildDeterministicReverbImpulse(graph.context, { decaySec: filter.decaySec, seed: filter.seed }); tail.connect(dry); dry.connect(merger); tail.connect(delay); delay.connect(convolver); convolver.connect(wet); wet.connect(merger); graph.replaceableNodes.push(dry, wet, delay, convolver, merger); return merger; }
  else { const eqFilter = filter as Extract<HammerNativePreviewFilter, { kind: "highpass" | "peaking" | "lowshelf" | "highshelf" | "noise_reduction" }>; const eq = graph.context.createBiquadFilter(); eq.type = eqFilter.kind === "noise_reduction" ? "lowpass" : eqFilter.kind; eq.frequency.value = eqFilter.kind === "noise_reduction" ? 14500 - (Math.max(0, Math.min(1, eqFilter.amount)) * 3500) : eqFilter.frequency; if (eqFilter.kind === "peaking") eq.Q.value = eqFilter.q; if ("gain" in eqFilter) eq.gain.value = eqFilter.gain; node = eq; }
  tail.connect(node); graph.replaceableNodes.push(node); return node;
}

export function applyHammerStudioRackNativePreview(element: HTMLMediaElement | null, rack: HammerStudioRackState): boolean {
  if (!element) return false; const Context = getAudioContextConstructor(); if (!Context) return false;
  let graph = graphs.get(element); try { if (!graph) { graph = createGraph(element, Context); graphs.set(element, graph); } } catch { return false; }
  graph.afterInput.disconnect(); for (const node of graph.replaceableNodes) node.disconnect(); graph.replaceableNodes = [];
  let tail: AudioNode = graph.afterInput; for (const filter of buildHammerNativePreviewPlan(rack)) tail = connectFilter(graph, tail, filter); tail.connect(graph.afterOutput);
  const after = rack.is_enabled && !rack.is_bypassed; graph.beforeGain.gain.setValueAtTime(after ? 0 : 1, graph.context.currentTime); graph.afterOutput.gain.setValueAtTime(after ? 1 : 0, graph.context.currentTime); void graph.context.resume(); return true;
}
