const baseUrl = String(process.env.HEARTH_BASE_URL || "https://podcastersforge.com").replace(/\/$/, "");
const authToken = String(process.env.NURSERY_AUTH_TOKEN || "").trim();

if (!authToken) {
  console.error("Hearth research readiness: NURSERY_AUTH_TOKEN is required.");
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);

try {
  const response = await fetch(`${baseUrl}/api/hearth/research/readiness`, {
    headers: { authorization: `Bearer ${authToken}` },
    signal: controller.signal,
  });
  const payload = await response.json().catch(() => ({}));
  const status = payload.provider_status || "configured_but_provider_failing";
  console.log(`Hearth research readiness: ${String(status).replaceAll("_", " ")}`);
  if (status !== "configured_and_operational" || !response.ok) process.exit(1);
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.error("Hearth research readiness: request cancelled.");
    process.exit(1);
  }
  console.error("Hearth research readiness: configured but provider failing.");
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
