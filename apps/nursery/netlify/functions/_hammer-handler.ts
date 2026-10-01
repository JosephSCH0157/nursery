import { runWithOwnerRuntimeEnvironment } from "../../server/accounting/owner-runtime-environment";
import {
  createHammerPaidHandler,
  type HammerPrepMiddlewareOptions,
} from "../../server/hammer/create-hammer-paid-handler";

export function createNetlifyHammerFunction(options: HammerPrepMiddlewareOptions = {}) {
  const handler = createHammerPaidHandler(options);
  return async function netlifyHammerFunction(
    request: Request,
    context?: { deploy?: { context?: string } },
  ): Promise<Response> {
    return runWithOwnerRuntimeEnvironment(context?.deploy?.context, () => handler(request));
  };
}
