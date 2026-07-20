import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseFfprobeMedia } from "../../../forge-ffmpeg/media-probe.mjs";

test("canonical probe distinguishes video with embedded audio from silent video",()=>{
  assert.deepEqual(parseFfprobeMedia({streams:[{codec_type:"video",width:1920,height:1080},{codec_type:"audio"}],format:{duration:"8.25"}}),{width:1920,height:1080,duration_ms:8250,has_audio:true,implementation:"forge-ffprobe-json-v1"});
  assert.equal(parseFfprobeMedia({streams:[{codec_type:"video",width:1280,height:720}],format:{duration:"4"}}).has_audio,false);
});

test("inspection migration preserves null semantics and requires inspected new brand videos",async()=>{
  const sql=await readFile(new URL("../../../supabase/migrations/20260720123000_tongs_brand_asset_media_inspection.sql",import.meta.url),"utf8");
  assert.match(sql,/has_audio boolean null/);assert.match(sql,/p_has_audio boolean default null/);assert.match(sql,/video_intro','video_outro/);assert.match(sql,/canonical video inspection is required/);
});

test("authenticated inspector uses stored bytes and finalizes one revision without derivatives",async()=>{
  const source=await readFile(new URL("../../../supabase/functions/inspect-brand-media/index.ts",import.meta.url),"utf8");
  assert.match(source,/storage\.from\(revision\.storage_bucket\)\.download\(revision\.storage_key\)/);assert.match(source,/p_has_audio: hasAudio/);assert.match(source,/p_revision_id: revision\.id/);
  assert.doesNotMatch(source,/audio_intro|audio_outro|extract|transcode/);
});

test("inspection lookup requires editor authority before storage or probe work",async()=>{
  const sql=await readFile(new URL("../../../supabase/migrations/20260720123000_tongs_brand_asset_media_inspection.sql",import.meta.url),"utf8");
  const source=await readFile(new URL("../../../supabase/functions/inspect-brand-media/index.ts",import.meta.url),"utf8");
  assert.match(sql,/get_brand_asset_revision_for_inspection/);assert.match(sql,/assert_workspace_role\(v_row\.workspace_id,'editor'\)/);
  assert.match(source,/rpc\("get_brand_asset_revision_for_inspection"/);assert.doesNotMatch(source,/error: \{ message: finalized\.error\.message \}/);
});

test("Brand Library derives video labels and independent readiness from canonical projection",async()=>{
  const source=await readFile(new URL("../src/routes/TongsBranding.tsx",import.meta.url),"utf8");
  for(const phrase of [/Video \+ audio/,/Video only/,/Audio track not inspected/,/Inspecting video…/,/Retry inspection/,/Audio-only branding/])assert.match(source,phrase);
  assert.match(source,/ready\("video_intro"\).*ready\("video_outro"\)/);assert.match(source,/ready\("audio_intro"\).*ready\("audio_outro"\)/);
});
