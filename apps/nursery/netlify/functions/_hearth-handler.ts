import { createHearthAiHandler } from "../../server/hearth/create-hearth-ai-handler";
import { resolveHearthRuntimeConfig } from "../../server/hearth/hearth-runtime-config";

const handler = createHearthAiHandler(resolveHearthRuntimeConfig());

export function createNetlifyHearthFunction(pathname: string) {
  return async function netlifyHearthFunction(request: Request): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = pathname;
    url.search = new URL(request.url).search;
    const forwarded = new Request(url.toString(), request);
    return handler(forwarded);
  };
}
