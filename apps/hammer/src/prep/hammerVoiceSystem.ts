import type { HammerPrepStep } from "./hammerPrep";

export type HammerVoicePhase =
  | "loading_context"
  | "transcript_prep"
  | "extracting_working_audio"
  | "analyzing_loudness"
  | "structure"
  | "finalizing_audio_prep"
  | "revision_save";

type HammerVoiceTier = "common" | "uncommon" | "rare" | "mythic";

export type HammerVoicePick = {
  phase: HammerVoicePhase;
  tier: HammerVoiceTier;
  line: string;
  mythicShown: boolean;
};

export function resolveHammerVoicePhase(step: HammerPrepStep | null): HammerVoicePhase {
  if (!step) return "loading_context";
  switch (step) {
    case "loading_context":
      return "loading_context";
    case "transcribing_audio":
    case "identifying_speaker_turns":
    case "finalizing_transcript":
      return "transcript_prep";
    case "placing_initial_visuals":
      return "structure";
    case "extracting_working_audio":
      return "extracting_working_audio";
    case "analyzing_loudness":
    case "detecting_silence":
    case "building_chunk_map":
      return "analyzing_loudness";
    case "finalizing_audio_prep":
      return "finalizing_audio_prep";
    case "ready_for_next_step":
      return "revision_save";
    default:
      return "loading_context";
  }
}

const COMMON: Record<HammerVoicePhase, string[]> = {
  loading_context: [
    "Preparing your episode…",
    "Warming up the bench…",
    "Gathering the pieces…",
  ],
  transcript_prep: [
    "Listening to the recording…",
    "Finding the natural rhythm…",
    "Breaking the raw material into shape…",
  ],
  extracting_working_audio: [
    "Drawing out the core signal…",
    "Preparing the material for shaping…",
    "Pulling a clean working track…",
  ],
  analyzing_loudness: [
    "Balancing the tone…",
    "Checking the weight of the mix…",
    "Tempering for clarity…",
  ],
  structure: [
    "Bringing the edges into alignment…",
    "Lining up the cuts…",
    "Tongs are getting a better grip…",
  ],
  finalizing_audio_prep: [
    "Bringing it all together…",
    "Final passes…",
    "Giving it a proper finish…",
  ],
  revision_save: [
    "Setting it on the anvil…",
    "Locking it in…",
    "Work complete…",
  ],
};

const UNCOMMON: Partial<Record<HammerVoicePhase, string[]>> = {
  transcript_prep: [
    "Marking the pauses and pivots…",
    "Tracing the voice through the noise…",
  ],
  extracting_working_audio: [
    "Heat up. Pull true. Keep it clean…",
    "Coaxing a steady signal from the source…",
  ],
  analyzing_loudness: [
    "Weighing the balance, ounce by ounce…",
    "Testing the grain of the sound…",
  ],
  structure: [
    "Squaring the joints before the heavy work…",
    "Joining the pieces where they naturally meet…",
  ],
  finalizing_audio_prep: [
    "Closing seams. Smoothing edges…",
    "A final check before we hand it over…",
  ],
  revision_save: [
    "Cooling the work before the next strike…",
  ],
};

const RARE: Partial<Record<HammerVoicePhase, string[]>> = {
  transcript_prep: [
    "With measured beat and slow…",
  ],
  extracting_working_audio: [
    "The bellows blow…",
  ],
  structure: [
    "On its sounding anvil shaped…",
    "The structure is holding…",
    "This work rewards a steady hand…",
  ],
  revision_save: [
    "Something attempted, something done.",
  ],
};

const MYTHIC_STRUCTURE: string[] = [
  "Even Wayland would pause to study this structure.",
  "Hephaestus would approve this shaping.",
  "Vulcan would call this well-forged.",
];

function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(items: T[], rng: () => number): T {
  const index = Math.max(0, Math.min(items.length - 1, Math.floor(rng() * items.length)));
  return items[index]!;
}

export function createHammerVoicePicker(seed: string): (args: {
  phase: HammerVoicePhase;
  lastLine: string | null;
  mythicShown: boolean;
}) => HammerVoicePick {
  const seedFn = xmur3(seed);
  const rng = mulberry32(seedFn());

  return (args) => {
    const roll = rng();
    const mythicEligible = args.phase === "structure" && !args.mythicShown;

    const mythicCutoff = mythicEligible ? 0.01 : 0;
    const rareCutoff = mythicCutoff + 0.04;
    const uncommonCutoff = rareCutoff + 0.10;

    if (mythicEligible && roll < mythicCutoff) {
      const line = pickFrom(MYTHIC_STRUCTURE, rng);
      return {
        phase: args.phase,
        tier: "mythic",
        line,
        mythicShown: true,
      };
    }

    const rarePool = RARE[args.phase] ?? [];
    const uncommonPool = UNCOMMON[args.phase] ?? [];
    const commonPool = COMMON[args.phase];

    let tier: HammerVoiceTier = "common";
    let pool = commonPool;

    if (roll < rareCutoff && rarePool.length > 0) {
      tier = "rare";
      pool = rarePool;
    } else if (roll < uncommonCutoff && uncommonPool.length > 0) {
      tier = "uncommon";
      pool = uncommonPool;
    }

    let line = pickFrom(pool, rng);
    if (args.lastLine && pool.length > 1 && line === args.lastLine) {
      line = pickFrom(pool, rng);
    }

    return {
      phase: args.phase,
      tier,
      line,
      mythicShown: args.mythicShown,
    };
  };
}
