import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import fsPromises from "node:fs/promises";
import { handleHammerAudioPolishRequest } from "../scripts/hammer-audio-polish";

type HammerAudioPolishRequestContext = {
  origin: string;
  authorization: string | null;
  userAuthorization: string | null;
};

function runCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    windowsHide: true,
  });
  if (result.status === 0) return;
  throw new Error(result.stderr?.toString("utf8") || `${command} failed`);
}

function commandAvailable(command: string): boolean {
  try {
    const result = spawnSync(command, ["-version"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function startCommitServer(): Promise<{
  origin: string;
  requests: Array<{ path: string; event_name: string; content_type: string }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{ path: string; event_name: string; content_type: string }> = [];
  const server = http.createServer((req, res) => {
    if ((req.method || "GET").toUpperCase() !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        path?: string;
        event_name?: string;
        content_type?: string;
      };
      requests.push({
        path: String(payload.path ?? ""),
        event_name: String(payload.event_name ?? ""),
        content_type: String(payload.content_type ?? ""),
      });
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, data: {} }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Commit server failed to bind.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function runOneCase(args: {
  localRootAbs: string;
  localRelpath: string;
  context: HammerAudioPolishRequestContext;
}): Promise<{
  status: number;
  payload: Awaited<ReturnType<typeof handleHammerAudioPolishRequest>>["payload"];
}> {
  const result = await handleHammerAudioPolishRequest(
    {
      workspace_id: "ws_hammer_audio_polish_test",
      workpiece_id: "wp_hammer_audio_polish_test",
      media_kind: "recording_audio",
      local_root_abs: args.localRootAbs,
      local_relpath: args.localRelpath,
      canonical_workpiece_path: `recordings/${args.localRelpath}`,
      mime_type: "audio/mp4",
    },
    args.context,
  );

  return {
    status: result.status,
    payload: result.payload,
  };
}

async function main(): Promise<void> {
  if (!commandAvailable("ffmpeg") || !commandAvailable("ffprobe")) {
    console.log("Skipping hammer audio polish route test (ffmpeg/ffprobe unavailable).");
    return;
  }

  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-audio-polish-route-test-"));
  const monoFile = "mono.m4a";
  const stereoFile = "stereo.m4a";
  const monoAbs = path.join(tempRoot, monoFile);
  const stereoAbs = path.join(tempRoot, stereoFile);

  try {
    runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1.8",
      "-ac",
      "1",
      "-ar",
      "48000",
      monoAbs,
    ]);
    runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=550:duration=1.8",
      "-ac",
      "2",
      "-ar",
      "48000",
      stereoAbs,
    ]);

    const commitServer = await startCommitServer();
    const context: HammerAudioPolishRequestContext = {
      origin: commitServer.origin,
      authorization: "Bearer test_token",
      userAuthorization: null,
    };

    try {
      const monoRunA = await runOneCase({
        localRootAbs: tempRoot,
        localRelpath: monoFile,
        context,
      });
      const monoRunB = await runOneCase({
        localRootAbs: tempRoot,
        localRelpath: monoFile,
        context,
      });
      const stereoRun = await runOneCase({
        localRootAbs: tempRoot,
        localRelpath: stereoFile,
        context,
      });

      assert.equal(monoRunA.status, 200);
      assert.equal(monoRunA.payload.ok, true);
      assert.equal(monoRunA.payload.data?.status, "prepared");
      assert.equal(monoRunA.payload.data?.settings_summary.channel_count, 1);
      assert.equal(monoRunA.payload.data?.settings_summary.sample_rate, 48000);
      assert.equal(monoRunA.payload.data?.settings_summary.bit_depth, 16);
      assert.equal(typeof monoRunA.payload.data?.settings_summary.timebase, "string");
      assert.equal(typeof monoRunA.payload.data?.settings_summary.source_timebase, "string");
      assert.equal(typeof monoRunA.payload.data?.settings_summary.source_duration_ms, "number");
      assert.equal(typeof monoRunA.payload.data?.settings_summary.working_duration_ms, "number");
      assert.equal(typeof monoRunA.payload.data?.settings_summary.working_audio_workpiece_path, "string");

      assert.equal(stereoRun.status, 200);
      assert.equal(stereoRun.payload.ok, true);
      assert.equal(stereoRun.payload.data?.status, "prepared");
      assert.equal(stereoRun.payload.data?.settings_summary.channel_count, 2);
      assert.equal(stereoRun.payload.data?.settings_summary.sample_rate, 48000);
      assert.equal(typeof stereoRun.payload.data?.settings_summary.working_audio_workpiece_path, "string");

      const monoWorkingPaths = commitServer.requests
        .filter((row) => row.event_name === "hammer.working-audio.committed" && row.path.includes("mono"))
        .map((row) => row.path);
      assert.equal(monoWorkingPaths.length >= 2, true);
      assert.equal(monoWorkingPaths[0], monoWorkingPaths[1]);
      assert.equal(monoWorkingPaths[0].includes("hammer/prep/working-audio"), true);
      assert.equal(commitServer.requests.some((row) => row.event_name === "hammer.audio-polish.committed"), true);

      assert.equal(monoRunA.payload.data?.settings_summary.working_audio_workpiece_path, monoWorkingPaths[0]);
      assert.equal(
        monoRunA.payload.data?.settings_summary.working_audio_workpiece_path,
        monoRunB.payload.data?.settings_summary.working_audio_workpiece_path,
      );
    } finally {
      await commitServer.close();
    }
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true });
  }

  console.log("Hammer audio polish route tests passed.");
}

main().catch((error) => {
  console.error("Hammer audio polish route tests failed:", error);
  process.exit(1);
});
