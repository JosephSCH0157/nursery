/** These creator endpoints currently have local middleware only. Do not turn
 * their deployment into authorization for a new paid provider route. */
export default async function handler(_request?: Request): Promise<Response> {
  void _request;
  return Response.json({ ok: false, error: {
    code: "paid_execution_unavailable",
    message: "This AI operation is not enabled for funded execution. Existing content and manual editing remain available.",
  } }, { status: 503, headers: { "cache-control": "no-store" } });
}

export const config = { path: [
  "/api/hammer/prep/transcript",
  "/api/quench/metadata/assist",
] };
