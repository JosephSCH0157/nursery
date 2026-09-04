import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PERFORMANCE_FIXTURE_VERSION = "hammer-preview-performance-fixture.v1";
export const INTERNAL_EVIDENCE_ROLES = ["presenter_edges", "visual_heavy", "transport_recovery"] as const;
type InternalEvidenceRole = typeof INTERNAL_EVIDENCE_ROLES[number];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const nursery = path.join(root, "apps/nursery");
export const fixturePath = path.join(nursery, "public/__hammer_performance__/long-form-1080p-v1.mp4");
export const fixtureManifestPath = path.join(nursery, "playwright/.cache/hammer-preview-performance-fixture.v1.json");
export const internalManifestPath = process.env.HAMMER_PERFORMANCE_INTERNAL_MANIFEST
  ? path.resolve(process.env.HAMMER_PERFORMANCE_INTERNAL_MANIFEST)
  : path.join(nursery, "playwright/.cache/hammer-preview-performance-internal.v1.json");

function git(...args: string[]): string { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function sha256(file: string): string { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function commandAvailable(command: string): boolean { return spawnSync(command, ["-version"], { windowsHide: true, stdio: "ignore" }).status === 0; }
function firstExisting(paths: readonly string[]): string | null { return paths.find((candidate) => fs.existsSync(candidate)) ?? null; }

export function resolveStableBrowser(browser: "chrome" | "edge", environment = process.env): string | null {
  const configured = environment[browser === "chrome" ? "HAMMER_CHROME_BIN" : "HAMMER_EDGE_BIN"];
  if (configured) return fs.existsSync(configured) ? configured : null;
  const programFiles = environment.ProgramFiles ?? "C:/Program Files";
  const programFilesX86 = environment["ProgramFiles(x86)"] ?? "C:/Program Files (x86)";
  const local = environment.LOCALAPPDATA ?? "";
  return firstExisting(browser === "chrome"
    ? [path.join(programFiles, "Google/Chrome/Application/chrome.exe"), path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"), path.join(local, "Google/Chrome/Application/chrome.exe")]
    : [path.join(programFilesX86, "Microsoft/Edge/Application/msedge.exe"), path.join(programFiles, "Microsoft/Edge/Application/msedge.exe"), path.join(local, "Microsoft/Edge/Application/msedge.exe")]);
}

export function assertPerformanceCandidate(args: { formal: boolean; declaredCandidate?: string; trackedStatus: string; head: string }): void {
  if (!args.formal) return;
  if (!/^[0-9a-f]{40}$/i.test(args.declaredCandidate ?? "")) throw new Error("HAMMER_PERFORMANCE_CANDIDATE_SHA must be a full commit SHA in formal mode.");
  if (args.head !== args.declaredCandidate) throw new Error("PERFORMANCE_CANDIDATE_HEAD_MISMATCH");
  if (args.trackedStatus.trim()) throw new Error("PERFORMANCE_CANDIDATE_WORKTREE_DIRTY");
}

export function validateInternalEpisodeManifest(value: unknown, publicRoot: string): void {
  const episodes = (value as { episodes?: Array<Record<string, unknown>> } | null)?.episodes;
  if (!Array.isArray(episodes) || episodes.length < 3) throw new Error("PERFORMANCE_INTERNAL_EPISODES_REQUIRED");
  const labels = new Set<string>();
  const roles = new Set<InternalEvidenceRole>();
  for (const episode of episodes) {
    const label = String(episode.sanitized_label ?? "");
    const publicPath = String(episode.public_path ?? "");
    const role = String(episode.evidence_role ?? "") as InternalEvidenceRole;
    if (episode.classification !== "internal_episode" || !label || labels.has(label)) throw new Error("PERFORMANCE_INTERNAL_EPISODE_IDENTITY_INVALID");
    if (!INTERNAL_EVIDENCE_ROLES.includes(role) || roles.has(role)) throw new Error("PERFORMANCE_INTERNAL_EVIDENCE_ROLE_INVALID");
    labels.add(label);
    roles.add(role);
    if (!/^\/[A-Za-z0-9_./-]+$/.test(publicPath) || publicPath.includes("..")) throw new Error("PERFORMANCE_INTERNAL_EPISODE_PATH_INVALID");
    const mediaPath = path.resolve(publicRoot, publicPath.slice(1));
    if (!mediaPath.startsWith(path.resolve(publicRoot)) || !fs.existsSync(mediaPath)) throw new Error("PERFORMANCE_INTERNAL_EPISODE_MEDIA_MISSING");
    if (String(episode.content_hash ?? "") !== sha256(mediaPath)) throw new Error("PERFORMANCE_INTERNAL_EPISODE_HASH_MISMATCH");
    const duration = Number(episode.duration_sec);
    const minimumDuration = role === "visual_heavy" ? 120 : role === "presenter_edges" ? 20 : 15;
    if (!Number.isFinite(duration) || duration < minimumDuration || Number(episode.width) < 1280 || Number(episode.height) < 720) throw new Error("PERFORMANCE_INTERNAL_EPISODE_SHAPE_INVALID");
  }
  if (roles.size !== INTERNAL_EVIDENCE_ROLES.length) throw new Error("PERFORMANCE_INTERNAL_EVIDENCE_ROLES_REQUIRED");
}

export function generateFixture(durationSec = 1_200): { contentHash: string; bytes: number } {
  if (!commandAvailable(process.env.HAMMER_FFMPEG_BIN ?? "ffmpeg")) throw new Error("PERFORMANCE_FFMPEG_UNAVAILABLE");
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  const ffmpeg = process.env.HAMMER_FFMPEG_BIN ?? "ffmpeg";
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000", "-t", String(durationSec), "-vf", "drawbox=x='mod(t*90,w-320)':y='h/4+sin(t)*90':w=260:h=500:color=0xC89B72@1:t=fill,drawbox=x='mod(t*90,w-320)+55':y='h/4+55':w=150:h=150:color=0x3B2A22@1:t=fill,noise=alls=4:allf=t+u", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-g", "60", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", fixturePath], { windowsHide: true, stdio: "inherit" });
  if (result.status !== 0 || !fs.existsSync(fixturePath)) throw new Error("PERFORMANCE_FIXTURE_GENERATION_FAILED");
  const manifest = { schema_version: PERFORMANCE_FIXTURE_VERSION, duration_sec: durationSec, width: 1920, height: 1080, frame_rate: 30, content_hash: sha256(fixturePath), bytes: fs.statSync(fixturePath).size, generated_at: new Date().toISOString(), public_path: "/__hammer_performance__/long-form-1080p-v1.mp4" };
  fs.mkdirSync(path.dirname(fixtureManifestPath), { recursive: true });
  fs.writeFileSync(fixtureManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { contentHash: manifest.content_hash, bytes: manifest.bytes };
}

export function runPreflight(): void {
  const formal = process.env.HAMMER_PERFORMANCE_FORMAL === "1";
  assertPerformanceCandidate({ formal, declaredCandidate: process.env.HAMMER_PERFORMANCE_CANDIDATE_SHA, head: git("rev-parse", "HEAD"), trackedStatus: git("status", "--porcelain", "--untracked-files=all") });
  for (const browser of ["chrome", "edge"] as const) if (!resolveStableBrowser(browser)) throw new Error(`PERFORMANCE_BROWSER_UNAVAILABLE:${browser}`);
  if (formal && process.env.HAMMER_PERFORMANCE_POWER_MODE !== "ac") throw new Error("PERFORMANCE_AC_POWER_DECLARATION_REQUIRED");
  if (formal && process.env.VITE_HAMMER_CANDIDATE_SHA !== process.env.HAMMER_PERFORMANCE_CANDIDATE_SHA) throw new Error("PERFORMANCE_BUILD_CANDIDATE_MISMATCH");
  const duration = Number(process.env.HAMMER_PERFORMANCE_FIXTURE_DURATION_SEC ?? 1_200);
  if (!fs.existsSync(fixturePath) || !fs.existsSync(fixtureManifestPath)) generateFixture(duration);
  let manifest = JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8")) as { content_hash: string; duration_sec: number };
  if (manifest.duration_sec !== duration || manifest.content_hash !== sha256(fixturePath)) {
    if (formal) throw new Error("PERFORMANCE_FIXTURE_IDENTITY_MISMATCH");
    generateFixture(duration);
    manifest = JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8")) as { content_hash: string; duration_sec: number };
  }
  if (formal) {
    if (!fs.existsSync(internalManifestPath)) throw new Error("PERFORMANCE_INTERNAL_MANIFEST_MISSING");
    validateInternalEpisodeManifest(JSON.parse(fs.readFileSync(internalManifestPath, "utf8")), path.join(nursery, "public"));
  }
  console.log(`[hammer-preview-performance] ${formal ? "formal" : "development"} preflight passed candidate=${git("rev-parse", "HEAD").slice(0, 12)} fixture=${manifest.content_hash.slice(0, 12)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runPreflight();
