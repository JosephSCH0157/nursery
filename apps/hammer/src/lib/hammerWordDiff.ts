export type WordDiffOpType = "equal" | "insert" | "delete";

export type WordDiffOp = {
  type: WordDiffOpType;
  words: string[];
};

function tokenizeComparisonWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenizeWords(text: string): string[] {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function pushOp(ops: WordDiffOp[], type: WordDiffOpType, word: string) {
  const last = ops[ops.length - 1];
  if (last && last.type === type) {
    last.words.push(word);
    return;
  }
  ops.push({ type, words: [word] });
}

function diffTokenArrays(before: string[], after: string[]): WordDiffOp[] {
  if (before.length === 0 && after.length === 0) return [];
  if (before.length === 0) return after.length ? [{ type: "insert", words: after }] : [];
  if (after.length === 0) return before.length ? [{ type: "delete", words: before }] : [];

  const maxCells = 40_000;
  if (before.length * after.length > maxCells) {
    return [
      { type: "delete", words: before },
      { type: "insert", words: after },
    ];
  }

  const rows = before.length + 1;
  const cols = after.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    const a = before[i - 1];
    for (let j = 1; j < cols; j += 1) {
      const b = after[j - 1];
      dp[i][j] = a === b ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: WordDiffOp[] = [];
  let i = before.length;
  let j = after.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) {
      pushOp(ops, "equal", before[i - 1]);
      i -= 1;
      j -= 1;
      continue;
    }
    const up = i > 0 ? dp[i - 1][j] : -1;
    const left = j > 0 ? dp[i][j - 1] : -1;
    if (j > 0 && (i === 0 || left >= up)) {
      pushOp(ops, "insert", after[j - 1]);
      j -= 1;
      continue;
    }
    if (i > 0) {
      pushOp(ops, "delete", before[i - 1]);
      i -= 1;
      continue;
    }
  }

  ops.reverse();
  for (const op of ops) {
    op.words.reverse();
  }
  return ops;
}

// Word-level diff using LCS. Intended for short transcript segments; for very large inputs,
// fall back to a single replace operation to avoid quadratic work.
export function diffWords(beforeText: string, afterText: string): WordDiffOp[] {
  return diffTokenArrays(tokenizeWords(beforeText), tokenizeWords(afterText));
}

export function diffTranscriptWords(beforeText: string, afterText: string): WordDiffOp[] {
  return diffTokenArrays(tokenizeComparisonWords(beforeText), tokenizeComparisonWords(afterText));
}

export function isSubtractiveTranscriptWordEdit(previousText: string, nextText: string): boolean {
  return diffTranscriptWords(previousText, nextText).every((op) => op.type !== "insert" || op.words.length === 0);
}
