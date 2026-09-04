import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyHammerPreviewPerformanceReceipt, type HammerPreviewPerformanceReceiptV1 } from "../../hammer/src/features/visual-effects/render/hammerPreviewPerformanceReceipt";

const nursery = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receiptsDirectory = path.join(nursery, "playwright/.cache/hammer-preview-performance-receipts");
const candidate = process.env.HAMMER_PERFORMANCE_CANDIDATE_SHA ?? "";
const scenarios = new Set(["continuous", "asset-heavy", "composite-controls", "matte-refinement", "seek-recovery"]);

export async function verifyReceiptSet(receipts: readonly HammerPreviewPerformanceReceiptV1[]): Promise<void> {
  if (!/^[0-9a-f]{40}$/i.test(candidate)) throw new Error("PERFORMANCE_CANDIDATE_SHA_REQUIRED");
  const keys = new Set<string>();
  const media = new Map<string, string>();
  for (const receipt of receipts) {
    if (receipt.mode !== "certification" || receipt.candidateCommit !== candidate) throw new Error("PERFORMANCE_RECEIPT_CANDIDATE_MISMATCH");
    if (!receipt.evaluation.passed || receipt.evaluation.blockingReasons.length) throw new Error("PERFORMANCE_RECEIPT_FAILED_THRESHOLD");
    if (!await verifyHammerPreviewPerformanceReceipt(receipt)) throw new Error("PERFORMANCE_RECEIPT_FINGERPRINT_INVALID");
    if (!scenarios.has(receipt.sampling.scenario)) throw new Error("PERFORMANCE_RECEIPT_SCENARIO_INVALID");
    const priorHash = media.get(receipt.media.sanitizedLabel); if (priorHash && priorHash !== receipt.media.contentHash) throw new Error("PERFORMANCE_MEDIA_HASH_UNSTABLE");
    media.set(receipt.media.sanitizedLabel, receipt.media.contentHash);
    const key = [receipt.sampling.certificationRun, receipt.browser.name, receipt.media.sanitizedLabel, receipt.sampling.scenario, receipt.sampling.repetition].join(":");
    if (keys.has(key)) throw new Error("PERFORMANCE_RECEIPT_DUPLICATE"); keys.add(key);
  }
  const internalCount = receipts.filter((receipt) => receipt.media.classification === "internal_episode").reduce((labels, receipt) => labels.add(receipt.media.sanitizedLabel), new Set<string>()).size;
  if (internalCount < 3) throw new Error("PERFORMANCE_INTERNAL_EPISODES_REQUIRED");
  const expected = media.size * 2 * 2 * scenarios.size * 3;
  if (keys.size !== expected) throw new Error(`PERFORMANCE_RECEIPT_SET_INCOMPLETE:${keys.size}/${expected}`);
}

if (!fs.existsSync(receiptsDirectory)) throw new Error("PERFORMANCE_RECEIPTS_MISSING");
const receipts = fs.readdirSync(receiptsDirectory).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(fs.readFileSync(path.join(receiptsDirectory, name), "utf8")) as HammerPreviewPerformanceReceiptV1);
await verifyReceiptSet(receipts);
console.log(`[hammer-preview-performance] verified ${receipts.length} receipts for ${candidate.slice(0, 12)}`);
