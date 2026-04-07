const MATCH_TOKEN_WINDOW = 28;

const META_PHRASES: RegExp[] = [
  /\bit(?:'s| is) not keeping up\b/gi,
  /\bit(?:'s| is) not moving\b/gi,
  /\bit(?:'s| is) not scrolling\b/gi,
  /\bhas(?:n't| not) moved\b/gi,
  /\bokay so\b/gi,
  /\byou know\b/gi,
  /\bi think\b/gi,
  /\blet(?:'s| us) see\b/gi,
  /\bi(?:'m| am) going to\b/gi,
  /\bim going to\b/gi,
  /\bgoing to have to\b/gi,
  /\bsend (?:you|u)\b/gi,
  /\bscreenshots?\b/gi,
  /\bchatgpt\b/gi,
  /\bdev\b/gi,
  /\blogs?\b/gi,
  /\bdebug\b/gi,
];

export function stripMatcherMetaPhrases(text: string): string {
  let out = String(text || '');
  for (const rx of META_PHRASES) {
    rx.lastIndex = 0;
    out = out.replace(rx, ' ');
  }
  return out;
}

export function prepareMatcherInput(
  text: string,
  tokenize: (value: string) => string[],
): {
  scrubbed: string;
  spokenTokens: string[];
  matchTokens: string[];
} {
  const scrubbed = stripMatcherMetaPhrases(text || '');
  const spokenTokens = tokenize(scrubbed);
  return {
    scrubbed,
    spokenTokens,
    matchTokens: spokenTokens.slice(-MATCH_TOKEN_WINDOW),
  };
}
