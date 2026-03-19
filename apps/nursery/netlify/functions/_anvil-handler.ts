import {
  createAnvilWhisperHandler,
  resolveAnvilWhisperRuntimeConfig,
} from "../../server/anvil/create-anvil-whisper-handler";

const handler = createAnvilWhisperHandler(resolveAnvilWhisperRuntimeConfig());

export function createNetlifyAnvilFunction(pathname: string) {
  return async function netlifyAnvilFunction(request: Request): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = pathname;
    url.search = new URL(request.url).search;
    const forwarded = new Request(url.toString(), request);
    return handler(forwarded);
  };
}
