import test from 'node:test';
import assert from 'node:assert/strict';
import {startPreflightFixture} from './fixtures/storage-h444-preflight-fixture.mjs';
import {createLocalPostgresTransport} from './lib/storage-h444-postgres.mjs';
import {collectSyntheticH444Preflight,PREFLIGHT_SQL,preflightBegin,preflightLimits,h444Versions} from './lib/storage-h444-preflight.mjs';
import {canonical,sha256} from './lib/storage-h444-exporter.mjs';
import {runOfflinePreflight} from './preflight-h444-source.mjs';
import {runPrivateProcess} from './lib/storage-h444-process.mjs';

const drain=async(transport,sql,options)=>{for await(const _ of transport.query(sql,options)){};};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('H444 metadata preflight with actual isolated PostgreSQL (synthetic only)',{timeout:180000},async t=>{
  const f=await startPreflightFixture();
  const gone=async transport=>assert.equal(Number((await f.admin("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+transport.applicationName+"';")).toString()),0);
  const collect=async(options={},wrap)=>{
    const transport=await createLocalPostgresTransport(f);
    try{wrap?.(transport);return await collectSyntheticH444Preflight({transport,...options});}
    finally{await transport.close();await gone(transport);}
  };
  try{
    await t.test('exact prefix, verified TLS, one snapshot and acknowledged rollback; no protected row SELECT privileges',async()=>{
      await f.admin("UPDATE tongs.private_pricing_revisions SET payload='PRIVATE_SYNTHETIC_FINANCE_SENTINEL'; UPDATE supabase_migrations.schema_migrations SET name='PRIVATE_SYNTHETIC_HISTORY_SENTINEL'; UPDATE storage.objects SET name='PRIVATE_SYNTHETIC_STORAGE_SENTINEL';");
      const r=await collect();
      assert.equal(r.metadataEligibility,'PASS');assert.equal(r.authenticSourceVerified,false);assert.equal(r.acquisitionApproved,false);
      assert.equal(r.history.count,444);assert.equal(r.history.head,'20261111201029');assert.equal(r.context.isolation,'repeatable read');
      assert.equal(r.context.readOnly,'on');assert.equal(r.context.ssl,true);assert.equal(r.rollbackVerified,true);assert.equal(r.connectionClosed,true);
      for(const entry of r.capabilities.filter(x=>x.name!=='forge_meta.database_lineage'))assert.equal(entry.requiredSelect,false);
      assert.ok(r.receivedBytes<65536);assert.ok(!JSON.stringify(r).includes('PRIVATE_SYNTHETIC'));
      assert.equal(r.fullExtractionScope,'NOT_VERIFIED');assert.equal(r.requiredFinancialRows,'NOT_INSPECTED');
      console.log(JSON.stringify({syntheticClient:{imageId:f.imageId,psqlSha256:r.clientSha256,version:f.psqlVersion,libpqSha256:f.libpqSha256},receivedBytes:r.receivedBytes}));
    });
    await t.test('financial, Storage and non-version history reads are denied by the fixture principal',async()=>{
      for(const sql of ['SELECT payload FROM tongs.private_pricing_revisions;','SELECT metadata FROM storage.objects;','SELECT statements FROM supabase_migrations.schema_migrations;']){
        const transport=await createLocalPostgresTransport(f);
        try{await drain(transport,preflightBegin());await assert.rejects(drain(transport,sql),e=>e.message==='postgres_query_failed');}
        finally{await transport.close();await gone(transport);}
      }
    });
    await t.test('a different 444-version set with the same count and head fails',async()=>{
      const first=h444Versions()[0];
      await f.admin("UPDATE supabase_migrations.schema_migrations SET version='20260101000000' WHERE version='"+first+"';");
      try{await assert.rejects(collect(),/preflight_history_prefix/);}
      finally{await f.admin("UPDATE supabase_migrations.schema_migrations SET version='"+first+"' WHERE version='20260101000000';");}
    });
    await t.test('advanced head and duplicate versions fail before the version list is returned',async()=>{
      await f.admin("INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20261113175455');");
      try{await assert.rejects(collect(),/preflight_history_boundary/);}
      finally{await f.admin("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261113175455';");}
      const first=h444Versions()[0],second=h444Versions()[1];
      await f.admin("UPDATE supabase_migrations.schema_migrations SET version='"+first+"' WHERE version='"+second+"';");
      try{await assert.rejects(collect(),/preflight_history_boundary/);}
      finally{await f.admin("DELETE FROM supabase_migrations.schema_migrations WHERE version='"+first+"'; INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('"+first+"'),('"+second+"');");}
    });
    await t.test('changed or duplicate lineage is rejected',async()=>{
      await f.admin("UPDATE forge_meta.database_lineage SET lineage='baseline-v1';");
      try{await assert.rejects(collect(),/preflight_lineage/);}
      finally{await f.admin("UPDATE forge_meta.database_lineage SET lineage='historical-v1';");}
      await f.admin('INSERT INTO forge_meta.database_lineage SELECT * FROM forge_meta.database_lineage;');
      try{await assert.rejects(collect(),/preflight_lineage/);}
      finally{await f.admin('DELETE FROM forge_meta.database_lineage WHERE ctid IN (SELECT ctid FROM forge_meta.database_lineage LIMIT 1);');}
    });
    await t.test('missing history columns or required relation fail without reading their contents',async()=>{
      await f.admin('ALTER TABLE supabase_migrations.schema_migrations RENAME rollback TO absent_rollback;');
      try{await assert.rejects(collect(),/preflight_required_columns|postgres_query_failed/);}
      finally{await f.admin('ALTER TABLE supabase_migrations.schema_migrations RENAME absent_rollback TO rollback;');}
      await f.admin('ALTER TABLE tongs.private_pricing_revisions RENAME TO absent_pricing;');
      try{await assert.rejects(collect(),/preflight_required_relation/);}
      finally{await f.admin('ALTER TABLE tongs.absent_pricing RENAME TO private_pricing_revisions;');}
    });
    await t.test('insufficient history privilege and possible RLS filtering fail closed',async()=>{
      await f.admin('REVOKE SELECT(version) ON supabase_migrations.schema_migrations FROM fixture_reader;');
      try{await assert.rejects(collect(),/preflight_metadata_access/);}
      finally{await f.admin('GRANT SELECT(version) ON supabase_migrations.schema_migrations TO fixture_reader;');}
      await f.admin('ALTER TABLE supabase_migrations.schema_migrations ENABLE ROW LEVEL SECURITY;');
      try{await assert.rejects(collect(),/preflight_metadata_access/);}
      finally{await f.admin('ALTER TABLE supabase_migrations.schema_migrations DISABLE ROW LEVEL SECURITY;');}
      await f.admin('ALTER ROLE fixture_reader BYPASSRLS;');
      try{await assert.rejects(collect(),/preflight_privileged_role/);}
      finally{await f.admin('ALTER ROLE fixture_reader NOBYPASSRLS;');}
    });
    await t.test('concurrent committed history changes cannot enter the observation snapshot',async()=>{
      let changed=false;
      try{
        const r=await collect({},transport=>{
          const query=transport.query.bind(transport);
          transport.query=async function*(sql,options){
            for await(const bytes of query(sql,options))yield bytes;
            if(sql===PREFLIGHT_SQL.identity){await f.admin("INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20261113175455');");changed=true;}
          };
        });
        assert.equal(changed,true);assert.equal(r.history.count,444);
        assert.equal(Number((await f.admin('SELECT count(*) FROM supabase_migrations.schema_migrations;')).toString()),445);
      }finally{await f.admin("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261113175455';");}
    });
    await t.test('snapshot/session drift in a returned frame is rejected',async()=>{
      await assert.rejects(collect({},transport=>{
        const query=transport.query.bind(transport);
        transport.query=async function*(sql,options){for await(const bytes of query(sql,options)){
          if(sql===PREFLIGHT_SQL.finish){const f=JSON.parse(bytes);f.context.pid++;yield Buffer.from(JSON.stringify(f));}else yield bytes;
        }};
      }),/preflight_snapshot_changed/);
    });
    await t.test('read-only transaction rejects DDL and fixture remains unchanged',async()=>{
      const transport=await createLocalPostgresTransport(f);
      try{await drain(transport,preflightBegin());await assert.rejects(drain(transport,'CREATE TABLE public.forbidden_preflight_write(id int);'),/postgres_query_failed/);}
      finally{await transport.close();await gone(transport);}
      assert.equal((await f.admin("SELECT to_regclass('public.forbidden_preflight_write') IS NULL;")).toString().trim(),'t');
    });
    await t.test('statement timeout, session deadline and output limits stop the client with sanitized errors',async()=>{
      await assert.rejects(collect({limits:{bytes:1024}}),/postgres_output_limit|preflight_output_limit/);
      await assert.rejects(collect({limits:{sessionMs:50}},transport=>{
        const query=transport.query.bind(transport);
        transport.query=async function*(sql,options){for await(const bytes of query(sql,options))yield bytes;if(sql===PREFLIGHT_SQL.identity)await delay(70);};
      }),/preflight_session_timeout|postgres_query_timeout/);
      const transport=await createLocalPostgresTransport(f);
      try{
        await drain(transport,preflightBegin(preflightLimits({queryMs:100})));
        await assert.rejects(drain(transport,"SELECT pg_sleep(2), 'PRIVATE_SYNTHETIC_ERROR_SENTINEL';",{timeoutMs:2000}),e=>e.message==='postgres_query_failed'&&!e.stack.includes('SENTINEL'));
      }finally{await transport.close();await gone(transport);}
    });
    await t.test('server idle-transaction and lock timeouts are effective',async()=>{
      const transport=await createLocalPostgresTransport(f);
      try{await drain(transport,preflightBegin(preflightLimits({idleMs:100})));await delay(250);await assert.rejects(drain(transport,'SELECT 1;'),/postgres_session_unavailable|postgres_query_failed/);}
      finally{await transport.close();await gone(transport);}
      const blocker=f.admin('BEGIN; LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(2); ROLLBACK;');
      try{await delay(300);await assert.rejects(collect({limits:{lockMs:100}}),/postgres_query_failed/);}
      finally{await blocker;}
    });
    await t.test('actual TLS rejects untrusted CA and wrong hostname, then recovers',async()=>{
      try{
        await f.exec(['cp','/fixture/other.crt','/fixture/ca.crt']);
        const plan=structuredClone(f.plan);plan.endpoint.caSha256=await f.fingerprint('/fixture/ca.crt');
        await assert.rejects(createLocalPostgresTransport({...f,plan,expectedPlanSha256:sha256(canonical(plan))}),/postgres_tls_or_identity_failed/);
        await f.exec(['sh','-c','cp /fixture/other.crt /fixture/server.crt && cp /fixture/other.key /fixture/server.key && chown postgres:postgres /fixture/server.* && chmod 600 /fixture/server.key']);
        await f.admin('SELECT pg_reload_conf();');await delay(250);
        await assert.rejects(createLocalPostgresTransport({...f,plan,expectedPlanSha256:sha256(canonical(plan))}),/postgres_tls_or_identity_failed/);
      }finally{
        await f.exec(['sh','-c','cp /fixture/good.crt /fixture/ca.crt && cp /fixture/good.crt /fixture/server.crt && cp /fixture/good.key /fixture/server.key && chown postgres:postgres /fixture/server.* && chmod 600 /fixture/server.key']);
        await f.admin('SELECT pg_reload_conf();');await delay(250);
      }
      await collect();
    });
    await t.test('libpq connection timeout bounds an unresponsive synthetic postmaster',async()=>{
      // Signal only this test-owned container's postmaster, never Docker Desktop.
      await runPrivateProcess('docker',['kill','--signal=SIGSTOP',f.container]);
      const started=performance.now();
      try{
        await assert.rejects(createLocalPostgresTransport(f),/postgres_tls_or_identity_failed/);
        const elapsed=performance.now()-started;
        assert.ok(elapsed>=4000&&elapsed<15000,'expected configured five-second connection timeout');
      }finally{await runPrivateProcess('docker',['kill','--signal=SIGCONT',f.container]);}
      await collect();
    });
    await t.test('cleanup failure cannot produce a passing receipt',async()=>{
      const transport=await createLocalPostgresTransport(f),close=transport.close.bind(transport);
      transport.close=async()=>{await close();throw Error('synthetic cleanup failure');};
      await assert.rejects(collectSyntheticH444Preflight({transport}),e=>e.message==='preflight_cleanup_failed'&&!e.stack.includes('synthetic cleanup failure'));await gone(transport);
    });
    await t.test('hosted arguments, weakened TLS and raised bounds are rejected',async()=>{
      for(const args of [[],['--host','db.authentic.invalid'],['--synthetic','--approved'],['--authentic']])await assert.rejects(runOfflinePreflight(args),/preflight_authentic_execution_not_approved/);
      for(const change of [{host:'db.authentic.invalid'},{sslmode:'require'}]){
        const plan=structuredClone(f.plan);Object.assign(plan.endpoint,change);
        await assert.rejects(createLocalPostgresTransport({...f,plan,expectedPlanSha256:sha256(canonical(plan))}),/endpoint_scope|verified_tls_required/);
      }
      assert.throws(()=>preflightLimits({bytes:65537}),/preflight_limit/);assert.throws(()=>preflightLimits({unknown:1}),/preflight_limit_field/);
    });
  }finally{await f.stop();}
});
