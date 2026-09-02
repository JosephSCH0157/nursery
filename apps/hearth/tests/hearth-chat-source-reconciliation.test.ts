import test from "node:test";
import assert from "node:assert/strict";
import {readFile}from"node:fs/promises";
const root=new URL("../src/",import.meta.url);
test("Hearth exposes reviewed chat Source recovery",async()=>{const view=await readFile(new URL("views/SourcesView.tsx",root),"utf8"),api=await readFile(new URL("lib/hearth-chat-source-reconciliation.ts",root),"utf8");assert.match(view,/Recover Sources from chat/);assert.match(view,/Recovered from chat/);assert.match(view,/Canonical episode Sources/);assert.match(view,/Matched to visual opportunities/);assert.match(api,/mode:\"dry_run\"/);assert.match(api,/mode:\"commit\"/);});
test("database recovery is snapshot-bound, atomic, and checks editorial invariance",async()=>{const sql=await readFile(new URL("../../../supabase/migrations/20260902120000_tongs_chat_source_reconciliation.sql",import.meta.url),"utf8");assert.match(sql,/chat_snapshot_conflict/);assert.match(sql,/commit_chat_source_reconciliation/);assert.match(sql,/visual reconciliation changed editorial content/);assert.match(sql,/reject_source_immutable_mutation/);});
