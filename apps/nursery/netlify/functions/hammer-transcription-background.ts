import type { Config, Context } from "@netlify/functions";

import { HAMMER_TRANSCRIPT_PREP_ROUTE } from "../../../hammer/src/prep/hammerPrepApi";
import { createNetlifyHammerFunction } from "./_hammer-handler";

const execute = createNetlifyHammerFunction({ hammerAssemblyAiExecutionMode: "background" });

export default async function hammerTranscriptionBackground(
  request: Request,
  context: Context,
): Promise<void> {
  const target = new URL(HAMMER_TRANSCRIPT_PREP_ROUTE, request.url);
  const forwarded = new Request(target, {
    method: "POST",
    headers: request.headers,
    body: await request.arrayBuffer(),
  });
  const response = await execute(forwarded, context);
  if (!response.ok && response.status !== 202) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hammer transcription background execution failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

export const config: Config = { background: true };
