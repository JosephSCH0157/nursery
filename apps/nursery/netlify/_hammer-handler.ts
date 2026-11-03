import { runWithOwnerRuntimeEnvironment } from "../server/accounting/owner-runtime-environment";
import {
  createHammerPaidHandler,
  type HammerPrepMiddlewareOptions,
} from "../server/hammer/create-hammer-paid-handler";
import { withAdmissionEnforcement } from "../server/auth/admission-enforcement";

export function createNetlifyHammerFunction(options: HammerPrepMiddlewareOptions = {}) {
  const handler = createHammerPaidHandler(options);
  return async function netlifyHammerFunction(
    request: Request,
    context?: { deploy?: { context?: string } },
  ): Promise<Response> {
    const operationClass = options.hammerAssemblyAiExecutionMode === "background"
      ? "existing_authorized_operation"
      : "new_customer_operation";
    return runWithOwnerRuntimeEnvironment(
      context?.deploy?.context ?? process.env.CONTEXT,
      () => withAdmissionEnforcement(request, operationClass, () => handler(request)),
    );
  };
}
