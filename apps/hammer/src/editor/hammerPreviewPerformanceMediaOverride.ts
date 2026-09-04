const ALLOWED_PERFORMANCE_MEDIA = /^\/__(?:hammer_performance|hammer_performance_internal)__\/[A-Za-z0-9._/-]+\.mp4$/;

export function resolveHammerPreviewPerformanceMediaOverride(args: { development: boolean; search: string }): string | null {
  if (!args.development) return null;
  const requested = new URLSearchParams(args.search).get("hammer_preview_performance_media")?.trim() ?? "";
  return ALLOWED_PERFORMANCE_MEDIA.test(requested) && !requested.includes("..") ? requested : null;
}
