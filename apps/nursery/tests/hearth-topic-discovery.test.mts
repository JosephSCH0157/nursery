import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildDiscoveryQueries } from "../server/hearth/hearth-topic-discovery";

test("discovery queries are preference-bound and capped",()=>{
 const queries=buildDiscoveryQueries({genre:"Technology",topic_interests:["privacy","AI"],editorial_scope:"creator tools",region:"US",language:"English"});
 assert.equal(queries.length,3); assert.ok(queries.every(q=>q.includes("Technology"))); assert.match(queries.join(" "),/privacy|creator tools/);
});

test("migration locks budgets, leases, immutable revisions, and exact acceptance",()=>{
 const sql=fs.readFileSync(new URL("../../../supabase/migrations/20260906120000_tongs_barstock_topic_discovery.sql",import.meta.url),"utf8");
 for(const expected of ["interval '6 hours'","interval '24 hours'","renew_barstock_discovery_lease","lease_token_hash","story_revision_id","accept_barstock_discovery_story","has_workspace_role(p_workspace_id,'editor')"]){assert.ok(sql.includes(expected),`missing ${expected}`);}
 assert.ok(sql.indexOf("create table tongs.barstock_discovery_story_revisions")<sql.indexOf("create table tongs.barstock_discovery_acceptances"));
});

test("context fallback migration preserves prior results and reports the combined throttle boundary",()=>{
 const sql=fs.readFileSync(new URL("../../../supabase/migrations/20261011130000_tongs_barstock_discovery_context_fallback.sql",import.meta.url),"utf8");
 assert.match(sql,/order by \(preference_revision = p\.revision\) desc/i);
 assert.match(sql,/status in \('ready', 'partial', 'empty'\)/i);
 assert.match(sql,/p\.user_id is not null and p\.enabled/i);
 assert.match(sql,/offset 3[\s\S]*limit 1/i);
 assert.match(sql,/greatest\(six_hour_boundary, twenty_four_hour_boundary\)/i);
 assert.match(sql,/'next_eligible_at'/i);
});
