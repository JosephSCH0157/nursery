import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../../../supabase/migrations/20260904120000_tongs_quench_podcast_host_boundary.sql",import.meta.url),"utf8");

test("podcast host replaces generic RSS as the executable release surface",()=>{
  assert.match(sql,/platform in\('youtube','podcast_host'\)/);
  assert.match(sql,/adapter_id in\('forge\.youtube','forge\.transistor'\)/);
  assert.match(sql,/host_owns_rss/);
  assert.match(sql,/direct_spotify_upload/);
  assert.match(sql,/forge_rss_hosting/);
  assert.match(sql,/\"provider\":\"transistor\"/);
  assert.match(sql,/\"audio_upload\":true/);
  assert.match(sql,/\"episode_draft_create\":true/);
  assert.match(sql,/\"episode_publish\":true/);
  assert.match(sql,/\"idempotent_episode_create\":false/);
});

test("publication establishment checks the exact Transistor capability revision",()=>{
  assert.match(sql,/quench_podcast_host_capability_is_compatible/);
  assert.match(sql,/publication_capability_incompatible/);
  assert.match(sql,/v_destination\.provider='rss_host' and v_scope\.platform<>'podcast_host'/);
});
