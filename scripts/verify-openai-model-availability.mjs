const key = process.env.OPENAI_TEXT_API_KEY || process.env.OPENAI_API_KEY;
if (!key) {
  console.error(JSON.stringify({ ok: false, blocker: "OPENAI_TEXT_API_KEY_or_OPENAI_API_KEY_required", operation: "GET /v1/models/{model}; no generation" }));
  process.exitCode = 2;
} else {
  const models = ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5-mini-2025-08-07", "gpt-5.6-luna", "gpt-5.3-chat-latest"];
  const evidence = [];
  for (const model of models) {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${key}` },
    });
    let providerId = null;
    if (response.ok) {
      const body = await response.json();
      providerId = typeof body?.id === "string" ? body.id : null;
    } else {
      await response.arrayBuffer();
    }
    evidence.push({ model, visible: response.ok && providerId === model, http_status: response.status });
  }
  console.log(JSON.stringify({
    ok: evidence.every((item) => item.visible),
    checked_at: new Date().toISOString(),
    check_kind: "model_visibility_only",
    generation_or_billable_request_made: false,
    evidence,
  }, null, 2));
}
