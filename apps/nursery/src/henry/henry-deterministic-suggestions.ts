import type {
  HearthHenrySignal,
  HenryContext,
  HenryMode,
  HenrySuggestion,
} from "@forge/shared/henry";

type DeterministicSuggestionInput = {
  context: HenryContext;
  mode: HenryMode | null;
  hearthSignal: HearthHenrySignal | null;
};

function isExploratoryQuestion(text: string): boolean {
  return /(what do you think|does this work|am i reading this right|pressure[- ]?test|help me frame)/i.test(text);
}

export function getHenryDeterministicSuggestion(input: DeterministicSuggestionInput): HenrySuggestion | null {
  const { context, mode, hearthSignal } = input;
  if (context.surface !== "hearth") return null;
  if (!mode || !hearthSignal) return null;

  if (mode === "idle") {
    return {
      kind: "question",
      text: "Want to heat this into an outline, or keep exploring the angle first?",
    };
  }

  if (mode === "warming") {
    return {
      kind: "clarify",
      text: "I can help shape this spark into a first draft while keeping your phrasing intact. Start with your strongest line?",
    };
  }

  if (mode === "blocked") {
    return {
      kind: "anvil_readiness",
      text: "This may need clean speaker tags before Anvil can read it cleanly.",
    };
  }

  if (mode === "structuring") {
    return {
      kind: "cadence",
      text: "This has a strong core. I can help split it into shorter read-aloud beats for Anvil.",
    };
  }

  if (mode === "reviewing") {
    return {
      kind: "clarify",
      text: "Ready means recordable, not perfect. Want one light pass for cadence, or keep this version?",
    };
  }

  if (mode === "recording_ready") {
    return {
      kind: "anvil_readiness",
      text: "This looks recordable. Not perfect, recordable.",
    };
  }

  return null;
}

export function buildHenryHearthChatAnswer(args: {
  question: string;
  context: HenryContext;
  mode: HenryMode | null;
  suggestion: HenrySuggestion | null;
}): string | null {
  if (args.context.surface !== "hearth") return null;
  const question = args.question.trim();
  if (!question) return args.suggestion?.text ?? null;

  if (/rewrite|reword|tighten|edit/i.test(question)) {
    return "I can do that. Paste the section you want to revise, and I will keep your voice while tightening read-aloud flow.";
  }

  if (/ready|recordable|anvil/i.test(question)) {
    return "Ready means recordable, not perfect. If you want, I can point out one spot to smooth for read-aloud flow.";
  }

  if (isExploratoryQuestion(question)) {
    return "I see the angle. What is the one claim you want the listener to remember at the end?";
  }

  if (args.suggestion) return args.suggestion.text;
  return "I can help shape this into record-ready lines while preserving your phrasing. What part feels least clear out loud?";
}

