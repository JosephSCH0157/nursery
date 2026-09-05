import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration=await readFile(new URL("../../../supabase/migrations/20260904120000_tongs_quench_destination_packages_youtube_jobs.sql",import.meta.url),"utf8");
const worker=await readFile(new URL("../../nursery/server/publishing/youtube-publication-worker.ts",import.meta.url),"utf8");
const route=await readFile(new URL("../../nursery/src/routes/Quench.tsx",import.meta.url),"utf8");
test("upload sessions are isolated from member-readable progress",()=>{assert.match(migration,/youtube_publication_job_secrets/);assert.match(migration,/no member policy/i);const start=migration.indexOf("read_youtube_publication_progress"),end=migration.indexOf("create or replace function",start+20);const projection=migration.slice(start,end);assert.doesNotMatch(projection,/encrypted_resumable_session_uri/)});
test("worker uses resumable range checkpoints",()=>{assert.match(worker,/content-range/i);assert.match(worker,/status===308/);assert.match(worker,/checkpoint_youtube_publication_job/)});
test("normal Quench flow hides development machinery",()=>{const guided=route.slice(route.indexOf('className="quench-flow"'),route.indexOf('return (',route.indexOf('className="quench-flow"')));assert.doesNotMatch(guided,/Stub board|development fixtures|Under Construction|Packet truth/)});
