import assert from "node:assert/strict";
import test from "node:test";
import { TransistorAdapter, TRANSISTOR_V1_CAPABILITIES } from "../src/adapters/transistor/transistor.adapter";
import type { ReleasePacket } from "../src/core/release-packet.types";

const packet: ReleasePacket = { release_packet_id:"r",workspace_id:"w",workpiece_id:"p",episode_id:"e",title:"Episode",description:"Notes",tags:["forge"],thumbnail_asset_id:null,video_export_id:null,audio_export_id:"a",shorts:[],asset_source:"cloud",rss_ready:true,platform_overrides:{} };
const context = { run_mode:"live" as const,now_iso:"2026-09-04T12:00:00Z",readiness:{status:"ready" as const,ready:true},resolved_assets:{audio:{asset_id:"a",kind:"audio" as const,source:"cloud" as const,uri:"tongs://a",accessible:true,mime_type:"audio/mpeg"}},publication_operation_id:"op",publication_attempt_id:"attempt",manifest_snapshot_id:"manifest",release_decision_id:"decision",executable_destination_id:"destination",destination_capability_revision_id:"cap" };

test("host boundary names only official Transistor publishing capabilities",()=>{
  assert.equal(TRANSISTOR_V1_CAPABILITIES.host_owns_rss,true);
  assert.equal(TRANSISTOR_V1_CAPABILITIES.forge_rss_hosting,false);
  assert.equal(TRANSISTOR_V1_CAPABILITIES.direct_spotify_upload,false);
  assert.equal(TRANSISTOR_V1_CAPABILITIES.idempotent_episode_create,false);
});

test("live submission binds canonical audio and durable operation evidence",async()=>{
  let seen:any;
  const adapter=new TransistorAdapter("show-1",{submitEpisode:async value=>{seen=value;return{episode_id:"episode-1",share_url:"https://example.transistor.fm/e/1",status:"published"};}});
  const result=await adapter.publish(packet,{enabled:true,mode:"publish"},context);
  assert.equal(result.ok,true); assert.equal(result.receipt.external_id,"episode-1");
  assert.equal(seen.show_id,"show-1"); assert.equal(seen.audio.asset_id,"a"); assert.equal(seen.publication_attempt_id,"attempt");
});

test("blind adapter retry is refused",async()=>{
  const adapter=new TransistorAdapter("show-1");
  const result=await adapter.retry({platform:"podcast_host",external_id:null,external_url:null,status:"failed",retry_count:0},context);
  assert.equal(result.ok,false); assert.match(result.message,/Reconcile/);
});
