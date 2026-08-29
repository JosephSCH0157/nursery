import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const MAX_BROLL_BYTES = 250 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

export type FetchedExternalMedia = {
  bytes: Uint8Array;
  finalUrl: string;
};

export type VerifiedBrollMedia = {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  durationMs: number | null;
  hasAudioStream?: boolean;
  hasVideoStream?: boolean;
};

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

export async function assertSafeExternalMediaUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("external_url_scheme_unsupported");
  if (url.username || url.password) throw new Error("external_url_credentials_unsupported");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("external_url_private_network_denied");
  return url;
}

function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  if (bytes.length >= 8 && bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE") return "audio/wav";
  if (bytes.length >= 3 && String.fromCharCode(...bytes.slice(0, 3)) === "ID3") return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "audio/mpeg";
  return null;
}

async function run(command: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(stdout).toString("utf8")) : reject(new Error(Buffer.concat(stderr).toString("utf8") || `${command} failed`)));
  });
}

async function withTempMedia<T>(bytes: Uint8Array, extension: string, work: (path: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "forge-broll-"));
  const path = join(dir, `media.${extension}`);
  try {
    await writeFile(path, bytes);
    return await work(path, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function inspectBrollMedia(bytes: Uint8Array, expected: "video" | "poster" | "audio"): Promise<VerifiedBrollMedia> {
  if (!bytes.length || bytes.length > MAX_BROLL_BYTES) throw new Error("broll_media_size_invalid");
  const mimeType = detectMime(bytes);
  const effectiveMime = expected === "audio" && mimeType === "video/mp4" ? "audio/mp4" : mimeType;
  if (!effectiveMime || (expected === "video" ? !effectiveMime.startsWith("video/") : expected === "audio" ? !effectiveMime.startsWith("audio/") : !effectiveMime.startsWith("image/"))) throw new Error("broll_media_signature_invalid");
  if (expected === "poster") {
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) throw new Error("broll_poster_metadata_invalid");
    return { bytes, mimeType: effectiveMime, width: metadata.width, height: metadata.height, durationMs: null };
  }
  const extension = effectiveMime === "video/mp4" || effectiveMime === "audio/mp4" ? "mp4"
    : effectiveMime === "audio/wav" ? "wav" : effectiveMime === "audio/mpeg" ? "mp3" : "webm";
  return await withTempMedia(bytes, extension, async (path) => {
    const output = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", path]);
    const parsed = JSON.parse(output) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }>; format?: { duration?: string } };
    const streams = parsed.streams ?? [];
    const videoStream = streams.find((stream) => stream.codec_type === "video");
    const hasAudioStream = streams.some((stream) => stream.codec_type === "audio");
    const hasVideoStream = Boolean(videoStream);
    const duration = Number(parsed.format?.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0
      || (expected === "audio" && !hasAudioStream)
      || (expected === "video" && (!hasVideoStream || !videoStream?.width || !videoStream.height))) {
      throw new Error("broll_timed_media_metadata_invalid");
    }
    return {
      bytes, mimeType: effectiveMime, width: videoStream?.width ?? 0, height: videoStream?.height ?? 0,
      durationMs: Math.round(duration * 1000), hasAudioStream, hasVideoStream,
    };
  });
}

export async function deriveBrollPoster(video: VerifiedBrollMedia): Promise<VerifiedBrollMedia> {
  if (!video.mimeType.startsWith("video/")) throw new Error("broll_video_required");
  return await withTempMedia(video.bytes, video.mimeType === "video/mp4" ? "mp4" : "webm", async (path, dir) => {
    const posterPath = join(dir, "poster.jpg");
    await run("ffmpeg", ["-v", "error", "-ss", "0.1", "-i", path, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-y", posterPath]);
    return inspectBrollMedia(new Uint8Array(await readFile(posterPath)), "poster");
  });
}

export async function fetchExternalBrollMedia(value: string, fetchImpl: typeof fetch = fetch): Promise<VerifiedBrollMedia> {
  const fetched = await fetchExternalMediaBytes(value, fetchImpl);
  return inspectBrollMedia(fetched.bytes, "video");
}

export async function fetchExternalMediaBytes(value: string, fetchImpl: typeof fetch = fetch): Promise<FetchedExternalMedia> {
  let url = await assertSafeExternalMediaUrl(value);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("external_redirect_invalid");
      url = await assertSafeExternalMediaUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`external_fetch_failed:${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BROLL_BYTES) throw new Error("external_media_too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BROLL_BYTES) throw new Error("external_media_too_large");
    return { bytes, finalUrl: url.toString() };
  }
  throw new Error("external_redirect_invalid");
}
