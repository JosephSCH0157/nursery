/** Server-only authority for the internal image-generation credential. */
export function resolveOpenAiImageApiKey(): string | null {
  const value = process.env.OPENAI_IMAGE_API_KEY;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
