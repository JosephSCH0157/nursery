import {
  createAnvilWhisperHandler,
  resolveAnvilWhisperRuntimeConfig,
} from "../../server/anvil/create-anvil-whisper-handler";
import { withAdmissionEnforcement } from "../../server/auth/admission-enforcement";

const handler = createAnvilWhisperHandler(resolveAnvilWhisperRuntimeConfig());

export function createNetlifyAnvilFunction(pathname: string) {
  return async function netlifyAnvilFunction(request: Request): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = pathname;
    url.search = new URL(request.url).search;
    const forwarded = new Request(url.toString(), request);
    return withAdmissionEnforcement(
      request,
      "new_customer_operation",
      () => handler(forwarded),
    );
  };
}
