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
  mimeType?: string;
  mediaKind?: "recording_audio" | "recording_video";
  context: HammerAudioPolishRequestContext;
}): Promise<{
  status: number;
  payload: Awaited<ReturnType<typeof handleHammerAudioPolishRequest>>["payload"];
}> {
  const result = await handleHammerAudioPolishRequest(
    {
      workspace_id: "ws_hammer_audio_polish_test",
      workpiece_id: "wp_hammer_audio_polish_test",
      media_kind: args.mediaKind ?? "recording_audio",
      local_root_abs: args.localRootAbs,
      local_relpath: args.localRelpath,
      canonical_workpiece_path: `recordings/${args.localRelpath}`,
      mime_type: args.mimeType ?? "audio/mp4",
    },
    args.context,
  );

  return {
    status: result.status,
    payload: result.payload,
  };
}

type FormatCase = {
  fileName: string;
  kind: "recording_audio" | "recording_video";
  mimeType: string;
  channels: 1 | 2;
  expectsWorkingAudioArtifact: boolean;
  build: (outputAbs: string, channels: 1 | 2) => void;
};

type SegmentationRegion = NonNullable<
  NonNullable<
    Awaited<ReturnType<typeof handleHammerAudioPolishRequest>>["payload"]["data"]
  >["analysis"]
>["segmentation"]["regions"][number];

const FORMAT_CASES: FormatCase[] = [
  {
    fileName: "mono.wav",
    kind: "recording_audio",
    mimeType: "audio/wav",
    channels: 1,
    expectsWorkingAudioArtifact: false,
    build: (outputAbs, channels) => {
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
        String(channels),
        "-ar",
        "48000",
        outputAbs,
      ]);
    },
  },
  {
    fileName: "mono.mp3",
    kind: "recording_audio",
    mimeType: "audio/mpeg",
    channels: 1,
    expectsWorkingAudioArtifact: true,
    build: (outputAbs, channels) => {
      runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=460:duration=1.8",
        "-ac",
        String(channels),
        "-ar",
        "48000",
        outputAbs,
      ]);
    },
  },
  {
    fileName: "mono.m4a",
    kind: "recording_audio",
    mimeType: "audio/mp4",
    channels: 1,
    expectsWorkingAudioArtifact: true,
    build: (outputAbs, channels) => {
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
        String(channels),
        "-ar",
        "48000",
        outputAbs,
      ]);
    },
  },
  {
    fileName: "stereo.m4a",
    kind: "recording_audio",
    mimeType: "audio/mp4",
    channels: 2,
    expectsWorkingAudioArtifact: true,
    build: (outputAbs, channels) => {
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
        String(channels),
        "-ar",
        "48000",
        outputAbs,
      ]);
    },
  },
  {
    fileName: "mono.mp4",
    kind: "recording_video",
    mimeType: "video/mp4",
    channels: 1,
    expectsWorkingAudioArtifact: true,
    build: (outputAbs, channels) => {
      runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=24:duration=1.8",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=600:duration=1.8",
        "-shortest",
        "-ac",
        String(channels),
        "-ar",
        "48000",
        "-pix_fmt",
        "yuv420p",
        outputAbs,
      ]);
    },
  },
  {
    fileName: "mono.mov",
    kind: "recording_video",
    mimeType: "video/quicktime",
    channels: 1,
    expectsWorkingAudioArtifact: true,
    build: (outputAbs, channels) => {
      runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=24:duration=1.8",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=660:duration=1.8",
        "-shortest",
        "-ac",
        String(channels),
        "-ar",
        "48000",
        "-pix_fmt",
        "yuv420p",
        outputAbs,
      ]);
    },
  },
];

function assertSegmentationCoverage(
  regions: SegmentationRegion[],
  durationMs: number,
  label: string,
): void {
  assert.equal(regions.length > 0, true, `${label} should produce at least one region`);
  assert.equal(regions[0]?.start_sec, 0, `${label} should start at 0`);
  const durationSec = durationMs / 1000;
  const lastRegion = regions[regions.length - 1];
  assert.equal(Math.abs((lastRegion?.end_sec ?? 0) - durationSec) <= 0.001, true, `${label} should end at file duration`);

  let previousEnd = 0;
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    assert.equal(region.start_sec >= 0, true, `${label} region ${index} has negative start`);
    assert.equal(region.end_sec > region.start_sec, true, `${label} region ${index} has invalid duration`);
    assert.equal(region.start_sec >= previousEnd, true, `${label} region ${index} is unsorted`);
    assert.equal(Math.abs(region.start_sec - previousEnd) <= 0.001, true, `${label} region ${index} breaks full coverage`);
    if (index > 0) {
      assert.notEqual(regions[index - 1]?.kind, region.kind, `${label} should merge adjacent same-kind regions`);
    }
    previousEnd = region.end_sec;
  }
}

async function main(): Promise<void> {
  if (!commandAvailable("ffmpeg") || !commandAvailable("ffprobe")) {
    console.log("Skipping hammer audio polish route test (ffmpeg/ffprobe unavailable).");
    return;
  }

  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-audio-polish-route-test-"));

  try {
    for (const testCase of FORMAT_CASES) {
      testCase.build(path.join(tempRoot, testCase.fileName), testCase.channels);
    }

    const commitServer = await startCommitServer();
    const context: HammerAudioPolishRequestContext = {
      origin: commitServer.origin,
      authorization: "Bearer test_token",
      userAuthorization: null,
    };

    try {
      const monoRunA = await runOneCase({
        localRootAbs: tempRoot,
        localRelpath: "mono.m4a",
        context,
      });
      const monoRunB = await runOneCase({
        localRootAbs: tempRoot,
        localRelpath: "mono.m4a",
        context,
      });
      const stereoRun = await runOneCase({
        localRootAbs: tempRoot,
        localRelpath: "stereo.m4a",
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
      assert.equal(typeof monoRunA.payload.data?.analysis?.loudness.integrated_lufs, "number");
      assert.equal(typeof monoRunA.payload.data?.analysis?.loudness.loudness_range_lu, "number");
      assert.equal(typeof monoRunA.payload.data?.analysis?.loudness.true_peak_dbtp, "number");
      assert.equal(typeof monoRunA.payload.data?.settings_summary.analysis_speech_region_count, "number");
      assert.equal(typeof monoRunA.payload.data?.settings_summary.analysis_silence_region_count, "number");
      assert.equal((monoRunA.payload.data?.analysis?.loudness.integrated_lufs ?? -Infinity) >= -60, true);
      assert.equal((monoRunA.payload.data?.analysis?.loudness.integrated_lufs ?? Infinity) <= 0, true);
      assert.equal((monoRunA.payload.data?.analysis?.loudness.true_peak_dbtp ?? Infinity) <= 0, true);
      assert.equal((monoRunA.payload.data?.analysis?.loudness.loudness_range_lu ?? -1) >= 0, true);
      assertSegmentationCoverage(
        monoRunA.payload.data?.analysis?.segmentation.regions ?? [],
        monoRunA.payload.data?.output_duration_ms ?? 0,
        "mono.m4a",
      );

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

      for (const testCase of FORMAT_CASES) {
        const formatRun = await runOneCase({
          localRootAbs: tempRoot,
          localRelpath: testCase.fileName,
          mimeType: testCase.mimeType,
          mediaKind: testCase.kind,
          context,
        });
        assert.equal(formatRun.status, 200, `${testCase.fileName} returned non-200`);
        assert.equal(formatRun.payload.ok, true, `${testCase.fileName} did not succeed`);
        assert.equal(formatRun.payload.data?.status, "prepared", `${testCase.fileName} did not prepare`);
        assert.equal(formatRun.payload.data?.settings_summary.sample_rate, 48000, `${testCase.fileName} sample rate drifted`);
        assert.equal(formatRun.payload.data?.settings_summary.bit_depth, 16, `${testCase.fileName} bit depth drifted`);
        assert.equal(formatRun.payload.data?.settings_summary.channel_count, testCase.channels, `${testCase.fileName} channel count drifted`);
        assert.equal(typeof formatRun.payload.data?.settings_summary.source_duration_ms, "number", `${testCase.fileName} missing source duration`);
        assert.equal(typeof formatRun.payload.data?.settings_summary.working_duration_ms, "number", `${testCase.fileName} missing working duration`);
        assert.equal(typeof formatRun.payload.data?.settings_summary.timebase, "string", `${testCase.fileName} missing working timebase`);
        assert.equal(typeof formatRun.payload.data?.analysis?.loudness.integrated_lufs, "number", `${testCase.fileName} missing integrated loudness`);
        assert.equal(typeof formatRun.payload.data?.analysis?.loudness.loudness_range_lu, "number", `${testCase.fileName} missing loudness range`);
        assert.equal(typeof formatRun.payload.data?.analysis?.loudness.true_peak_dbtp, "number", `${testCase.fileName} missing true peak`);
        assert.equal(typeof formatRun.payload.data?.settings_summary.analysis_speech_region_count, "number", `${testCase.fileName} missing speech region count`);
        assert.equal(typeof formatRun.payload.data?.settings_summary.analysis_silence_region_count, "number", `${testCase.fileName} missing silence region count`);
        assert.equal((formatRun.payload.data?.analysis?.loudness.integrated_lufs ?? -Infinity) >= -60, true, `${testCase.fileName} integrated loudness out of range`);
        assert.equal((formatRun.payload.data?.analysis?.loudness.integrated_lufs ?? Infinity) <= 0, true, `${testCase.fileName} integrated loudness out of range`);
        assert.equal((formatRun.payload.data?.analysis?.loudness.true_peak_dbtp ?? Infinity) <= 0, true, `${testCase.fileName} true peak out of range`);
        assert.equal((formatRun.payload.data?.analysis?.loudness.loudness_range_lu ?? -1) >= 0, true, `${testCase.fileName} loudness range out of range`);
        assertSegmentationCoverage(
          formatRun.payload.data?.analysis?.segmentation.regions ?? [],
          formatRun.payload.data?.output_duration_ms ?? 0,
          testCase.fileName,
        );
        assert.equal(
          formatRun.payload.data?.settings_summary.source_extension,
          path.extname(testCase.fileName).toLowerCase(),
          `${testCase.fileName} source extension drifted`,
        );
        if (testCase.expectsWorkingAudioArtifact) {
          assert.equal(typeof formatRun.payload.data?.settings_summary.working_audio_workpiece_path, "string", `${testCase.fileName} missing working audio path`);
        } else {
          assert.equal(formatRun.payload.data?.settings_summary.working_audio_workpiece_path, null, `${testCase.fileName} unexpectedly created working audio path`);
        }
      }

      const segmentationFixtures = [
        {
          fileName: "seg_silence_tone_silence.wav",
          build: () => runCommand("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=mono:d=0.4",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=0.7",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=mono:d=0.5",
            "-filter_complex",
            "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
            "-map",
            "[out]",
            path.join(tempRoot, "seg_silence_tone_silence.wav"),
          ]),
          assertRegions: (regions: SegmentationRegion[]) => {
            assert.equal(regions.length, 3);
            assert.deepEqual(regions.map((region) => region.kind), ["silence", "speech", "silence"]);
          },
        },
        {
          fileName: "seg_mostly_silent.wav",
          build: () => runCommand("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=mono:d=1.2",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "48000",
            path.join(tempRoot, "seg_mostly_silent.wav"),
          ]),
          assertRegions: (regions: SegmentationRegion[]) => {
            assert.equal(regions.length >= 1, true);
            assert.equal(regions[0]?.kind, "silence");
          },
        },
        {
          fileName: "seg_dense_continuous.wav",
          build: () => runCommand("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=520:duration=1.2",
            "-ac",
            "1",
            "-ar",
            "48000",
            path.join(tempRoot, "seg_dense_continuous.wav"),
          ]),
          assertRegions: (regions: SegmentationRegion[]) => {
            assert.equal(regions.length, 1);
            assert.equal(regions[0]?.kind, "speech");
          },
        },
      ] as const;

      for (const fixture of segmentationFixtures) {
        fixture.build();
        const fixtureRun = await runOneCase({
          localRootAbs: tempRoot,
          localRelpath: fixture.fileName,
          mimeType: "audio/wav",
          mediaKind: "recording_audio",
          context,
        });
        assert.equal(fixtureRun.status, 200, `${fixture.fileName} returned non-200`);
        assert.equal(fixtureRun.payload.data?.status, "prepared", `${fixture.fileName} did not prepare`);
        const regions = fixtureRun.payload.data?.analysis?.segmentation.regions ?? [];
        assertSegmentationCoverage(
          regions,
          fixtureRun.payload.data?.output_duration_ms ?? 0,
          fixture.fileName,
        );
        fixture.assertRegions(regions);
      }
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
