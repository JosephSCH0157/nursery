import { resolve } from "node:path";
import {
  collectEvidence,
  writeEvidenceArtifacts,
} from "./lib/hammer-canary-supplier-evidence.mjs";

const adminKey = process.env.OPENAI_RECONCILIATION_ADMIN_KEY;
const projectId = process.env.OPENAI_RECONCILIATION_PROJECT_ID;
const configuredOutputDirectory = process.env.HAMMER_SUPPLIER_EVIDENCE_DIR;

try {
  if (!configuredOutputDirectory) {
    throw new Error("HAMMER_SUPPLIER_EVIDENCE_DIR_required");
  }
  const outputDirectory = resolve(configuredOutputDirectory);
  const evidence = await collectEvidence({ adminKey, projectId });
  const digests = await writeEvidenceArtifacts({
    outputDirectory,
    ...evidence,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      collection_status: evidence.analysis.collection_status,
      attribution_status: evidence.analysis.attribution_status,
      raw_evidence_sha256: digests.rawDigest,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `Hammer supplier evidence collection failed: ${error instanceof Error ? error.message : "unknown_error"}\n`,
  );
  process.exitCode = 1;
}
