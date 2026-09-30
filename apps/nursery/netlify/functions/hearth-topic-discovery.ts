import { resolveBarStockOwnerRuntimeConfig } from "../../server/bar-stock/bar-stock-owner-runtime-config";
import { runWithOwnerRuntimeEnvironment } from "../../server/accounting/owner-runtime-environment";
import { createHearthTopicDiscoveryHandler } from "../../server/hearth/hearth-topic-discovery";
import { resolveHearthRuntimeConfig } from "../../server/hearth/hearth-runtime-config";

const handler = createHearthTopicDiscoveryHandler({
  ...resolveHearthRuntimeConfig(),
  ...resolveBarStockOwnerRuntimeConfig(),
});

export default function netlifyHearthTopicDiscoveryFunction(
  request: Request,
  context?: { deploy?: { context?: string } },
): Promise<Response> {
  return runWithOwnerRuntimeEnvironment(context?.deploy?.context, () => handler(request));
}
