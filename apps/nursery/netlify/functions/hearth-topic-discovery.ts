import { resolveBarStockOwnerRuntimeConfig } from "../../server/bar-stock/bar-stock-owner-runtime-config";
import { createHearthTopicDiscoveryHandler } from "../../server/hearth/hearth-topic-discovery";
import { resolveHearthRuntimeConfig } from "../../server/hearth/hearth-runtime-config";

export default createHearthTopicDiscoveryHandler({
  ...resolveHearthRuntimeConfig(),
  ...resolveBarStockOwnerRuntimeConfig(),
});
