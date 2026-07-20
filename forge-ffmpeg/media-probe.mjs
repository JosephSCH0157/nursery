export function parseFfprobeMedia(payload) {
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const video = streams.find((stream) => stream?.codec_type === "video");
  if (!video) throw new Error("Stored media does not contain a video stream.");
  const width = Number(video.width); const height = Number(video.height);
  const durationSeconds = Number(payload?.format?.duration ?? video.duration);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || !Number.isFinite(durationSeconds) || durationSeconds < 0) throw new Error("Video inspection returned incomplete canonical metadata.");
  return { width, height, duration_ms: Math.round(durationSeconds * 1000), has_audio: streams.some((stream) => stream?.codec_type === "audio"), implementation: "forge-ffprobe-json-v1" };
}
