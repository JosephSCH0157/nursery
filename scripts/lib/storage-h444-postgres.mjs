// Real PostgreSQL protocol via pinned psql/pg_dump, confined to a disposable
// synthetic container's loopback. There is deliberately no hosted transport.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ExportHold,canonical,sha256,validatePlan} from './storage-h444-exporter.mjs';
import {localDockerArguments,localProcessEnvironment,runPrivateProcess} from './storage-h444-process.mjs';

const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
export async function inspectFixtureContainer(container,runId,imageId) {
  hold(/^forge-h444-offline-[a-f0-9]{16}$/.test(container)&&container.endsWith(runId),'local_fixture_identity');
  const [info]=JSON.parse(await runPrivateProcess('docker',['inspect',container]));
  hold(info.State.Running && info.Config.Labels?.['forge.h444.offline']===runId
    &&info.Image===imageId && info.HostConfig.NetworkMode==='none'
    &&info.HostConfig.LogConfig.Type==='none' &&!info.HostConfig.Privileged
    &&Object.keys(info.HostConfig.PortBindings??{}).length===0
    &&info.Mounts.every(m=>m.Type==='tmpfs'),'local_fixture_isolation');
  return info;
}
export async function createLocalPostgresTransport({container,runId,imageId,plan,expectedPlanSha256,versions}) {
  validatePlan(plan,expectedPlanSha256,versions);
  await inspectFixtureContainer(container,runId,imageId);
  hold(plan.endpoint.caFile==='/fixture/ca.crt','fixture_ca_path');
  const fingerprint=async path=>(await runPrivateProcess('docker',['exec',container,'sha256sum',path])).toString().split(/\s/)[0];
  hold(await fingerprint('/usr/lib/postgresql/17/bin/psql')===plan.tools.psqlSha256
    &&await fingerprint('/usr/lib/postgresql/17/bin/pg_dump')===plan.tools.pgDumpSha256
    &&await fingerprint('/fixture/ca.crt')===plan.endpoint.caSha256,'fixture_tool_or_ca_changed');
  const applicationName=container+'-'+randomBytes(6).toString('hex');
  const env=['env','-i','PATH=/usr/bin:/bin', 'PGHOST=fixture.invalid','PGHOSTADDR=127.0.0.1','PGPORT=5432',
    'PGDATABASE=postgres','PGUSER=fixture_reader','PGSSLMODE=verify-full','PGSSLROOTCERT=/fixture/ca.crt',
    'PGPASSFILE=/nonexistent','PGSERVICEFILE=/nonexistent','PGCONNECT_TIMEOUT=5','PGAPPNAME='+applicationName,
    'PGOPTIONS=-c default_transaction_read_only=on -c row_security=off -c statement_timeout=30000 -c lock_timeout=2000'];
  const prefix=['exec','-i',container,...env];
  let active,dead=false,diagnosticBytes=0,closed=false;
  const child=spawn('docker',localDockerArguments([...prefix,'/usr/lib/postgresql/17/bin/psql','-X','-qAt','--no-password','-v','ON_ERROR_STOP=1','-P','pager=off','-f','-']),
    {env:localProcessEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
  const exit=new Promise(resolve=>child.once('close',resolve));
  const fail=code=>{dead=true;if(active){const a=active;active=null;a.finish(new ExportHold(code));}child.kill();};
  child.on('error',()=>fail('postgres_client_failed'));
  child.stdin.on('error',()=>fail('postgres_client_failed'));
  child.stderr.on('data',bytes=>{diagnosticBytes+=bytes.length;if(diagnosticBytes>65536)fail('postgres_diagnostic_limit');});
  child.on('close',()=>{dead=true;if(active)fail('postgres_query_failed');});
  child.stdout.on('data',bytes=>{
    if(!active){fail('postgres_unframed_output');return;}
    const a=active;a.bytes=Buffer.concat([a.bytes,bytes]);
    if(a.bytes.length>a.maxBytes+a.marker.length+8){fail('postgres_output_limit');return;}
    const index=a.bytes.indexOf(a.marker);
    if(index!==-1){
      if(index>0&&a.bytes[index-1]!==10){fail('postgres_frame_invalid');return;}
      if(a.bytes.length!==index+a.marker.length){fail('postgres_frame_invalid');return;}
      active=null;a.finish(null,a.bytes.subarray(0,index));
    }
  });
  const request=(sql,{signal,timeoutMs=30000,maxBytes=128*1024*1024}={})=>new Promise((resolve,reject)=>{
    if(active||dead||closed){reject(new ExportHold('postgres_session_unavailable'));return;}
    const token='H444_'+randomBytes(16).toString('hex'), marker=Buffer.from(token+'\n');
    const abort=()=>fail('postgres_query_aborted');
    const timer=setTimeout(()=>fail('postgres_query_timeout'),timeoutMs);
    const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
    active={marker,bytes:Buffer.alloc(0),maxBytes,finish};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    child.stdin.write(sql+'\n\\echo '+token+'\n');
  });
  const transport={kind:'synthetic-fixture',executionClass:'local-postgresql',applicationName,rollbackVerified:false,closed:false,backendPid:null,
    provenance:{executionClass:'local-postgresql',imageId,runId,applicationName,
      transportSha256:sha256(readFileSync(new URL(import.meta.url))),
      processHelperSha256:sha256(readFileSync(new URL('./storage-h444-process.mjs',import.meta.url))),
      network:'none',hostAddress:'127.0.0.1',role:'fixture_reader'},
    async *query(sql,options){yield await request(sql,options);},
    async *dump(requested,options){
      hold(requested.environment.PGSSLMODE==='verify-full'&&requested.environment.PGHOST==='fixture.invalid'
        &&requested.environment.PGSSLROOTCERT==='/fixture/ca.crt'&&requested.snapshotId.match(/^[a-f0-9]+-[a-f0-9]+-[a-f0-9]+$/i)
        &&requested.executableSha256===plan.tools.pgDumpSha256,'dump_transport_policy');
      const allowed=['--format=plain','--schema-only','--quote-all-identifiers','--no-password','--lock-wait-timeout=2000',
        '--snapshot='+requested.snapshotId,...requested.schemas.map(s=>'--schema='+s)];
      hold(canonical(allowed)===canonical(requested.args)&&requested.schemas.every(s=>plan.schemas.includes(s)),'dump_transport_scope');
      await inspectFixtureContainer(container,runId,imageId);
      yield await runPrivateProcess('docker',[...prefix,'/usr/lib/postgresql/17/bin/pg_dump',...allowed],options);
    },
    async close({rollback=true}={}){
      if(closed)return;
      let failed=false;
      try {
        if(!dead&&rollback){await request('ROLLBACK;', {timeoutMs:2000,maxBytes:1024});transport.rollbackVerified=true;}
        if(!dead)child.stdin.end('\\q\n');
        else child.kill();
        await Promise.race([exit,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new ExportHold('postgres_close_timeout')),2000);t.unref();})]);
      }catch{failed=true;child.kill();}
      finally{closed=true;transport.closed=true;}
      // docker exec termination is not proof that its server session ended.
      // Query the isolated fixture admin socket and terminate only this
      // transport's sessions, including an interrupted pg_dump subprocess.
      if(transport.backendPid){
        const scope="application_name='"+applicationName+"' AND usename='fixture_reader'";
        const check=async()=>Number((await runPrivateProcess('docker',['exec','-i',container,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
          {input:Buffer.from('SELECT count(*) FROM pg_stat_activity WHERE '+scope+';'),timeoutMs:2000,maxBytes:1024})).toString().trim());
        if(await check()){
          await runPrivateProcess('docker',['exec','-i',container,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
            {input:Buffer.from('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE '+scope+';'),timeoutMs:2000,maxBytes:1024});
          if(await check())failed=true;
        }
      }
      if(failed)throw new ExportHold('postgres_cleanup_failed');
    },
  };
  try {
    // Actual successful verify-full connection, not caller-supplied TLS booleans.
    const peer=JSON.parse((await request("SELECT json_build_object('pid',pg_backend_pid(),'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'role',current_user,'database',current_database());")).toString());
    hold(peer.ssl===true&&peer.role==='fixture_reader'&&peer.database==='postgres'&&Number.isSafeInteger(peer.pid),'postgres_identity_failed');
    transport.backendPid=peer.pid;
    const fixtureIdentity=JSON.parse((await request("SELECT json_build_object('runId',run_id,'kind',evidence_kind) FROM public.h444_fixture_identity;")).toString());
    hold(fixtureIdentity.runId===runId&&fixtureIdentity.kind==='SYNTHETIC_ONLY','postgres_fixture_identity');
    transport.connectionEvidence={...plan.endpoint,hostnameVerified:true,chainVerified:true,psqlSha256:plan.tools.psqlSha256};
    return transport;
  }catch{await transport.close({rollback:false});throw new ExportHold('postgres_tls_or_identity_failed');}
}
