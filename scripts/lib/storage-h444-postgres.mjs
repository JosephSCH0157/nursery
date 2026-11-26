// Pinned PostgreSQL clients. The original fixture path remains network-isolated.
// The authentic client is created only after independently pinned acquisition approval.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ExportHold,canonical,sha256,validatePlan} from './storage-h444-exporter.mjs';
import {validateAcquisitionAuthorization} from './storage-h444-authorization.mjs';
import {localDockerArguments,localProcessEnvironment,runPrivateProcess} from './storage-h444-process.mjs';
import {isManagedAcquisition,validateManagedExecutionApproval} from './storage-h444-managed.mjs';

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
export async function createLocalPostgresTransport(options) {return createPostgresTransport(options);}
async function createPostgresTransport({container,runId,imageId,plan,expectedPlanSha256,versions,credential,authorization,client=false}) {
  validatePlan(plan,expectedPlanSha256,versions,authorization);
  const approval=authorization?validateAcquisitionAuthorization({...authorization,plan,synthetic:!client}):null;
  const inspect=()=>client?inspectAcquisitionClient(container,runId,imageId):inspectFixtureContainer(container,runId,imageId);
  await inspect();
  const managed=isManagedAcquisition(approval);
  const role=approval?.principalApproval||managed||client?approval.principal:'fixture_reader';
  if(credential)hold(Buffer.isBuffer(credential)&&credential.length>0&&credential.length<=2048&&!credential.includes(0)&&!credential.includes(10)&&!credential.includes(13),'credential_format');
  const passwordInput=()=>credential?Buffer.concat([credential,Buffer.from('\n')]):undefined;
  hold(plan.endpoint.caFile==='/fixture/ca.crt','fixture_ca_path');
  const fingerprint=async path=>(await runPrivateProcess('docker',['exec',container,'sha256sum',path])).toString().split(/\s/)[0];
  hold(await fingerprint('/usr/lib/postgresql/17/bin/psql')===plan.tools.psqlSha256
    &&await fingerprint('/usr/lib/postgresql/17/bin/pg_dump')===plan.tools.pgDumpSha256
    &&await fingerprint('/fixture/ca.crt')===plan.endpoint.caSha256,'fixture_tool_or_ca_changed');
  const applicationName=container+'-'+randomBytes(6).toString('hex');
  const env=['env','-i','PATH=/usr/bin:/bin', 'PGHOST='+plan.endpoint.host,...(client?[]:['PGHOSTADDR=127.0.0.1']),'PGPORT=5432',
    'PGDATABASE=postgres','PGUSER='+role,'PGSSLMODE=verify-full','PGSSLROOTCERT=/fixture/ca.crt',
    'PGPASSFILE=/nonexistent','PGSERVICEFILE=/nonexistent','PGCONNECT_TIMEOUT=5','PGAPPNAME='+applicationName,
    'PGOPTIONS=-c default_transaction_read_only=on -c row_security=off -c statement_timeout=30000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=600000 -c transaction_timeout=600000'];
  const prefix=['exec','-i',container,...env,...(credential?['sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"','private-credential']:[])];
  let active,dead=false,diagnosticBytes=0,closed=false;
  const child=spawn('docker',localDockerArguments([...prefix,'/usr/lib/postgresql/17/bin/psql','-X','-qAt','--no-password','-v','ON_ERROR_STOP=1','-P','pager=off','-f','-']),
    {env:localProcessEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
  const secret=passwordInput();if(secret)child.stdin.write(secret,()=>secret.fill(0));
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
  const transport={kind:client?'approved-postgresql':'synthetic-fixture',executionClass:client?'approved-direct-postgresql':'local-postgresql',applicationName,rollbackVerified:false,closed:false,backendPid:null,
    provenance:{executionClass:client?'approved-direct-postgresql':'local-postgresql',imageId,runId,applicationName,
      transportSha256:sha256(readFileSync(new URL(import.meta.url))),
      processHelperSha256:sha256(readFileSync(new URL('./storage-h444-process.mjs',import.meta.url))),
      network:client?'bridge-direct-source':'none',hostAddress:client?plan.endpoint.host:'127.0.0.1',role},
    async *query(sql,options){yield await request(sql,options);},
    async *dump(requested,options){
      hold(requested.environment.PGSSLMODE==='verify-full'&&requested.environment.PGHOST===plan.endpoint.host
        &&requested.environment.PGSSLROOTCERT==='/fixture/ca.crt'&&requested.snapshotId.match(/^[a-f0-9]+-[a-f0-9]+-[a-f0-9]+$/i)
        &&requested.executableSha256===plan.tools.pgDumpSha256,'dump_transport_policy');
      const allowed=['--format=plain','--schema-only','--quote-all-identifiers','--no-password',...(managed?['--no-subscriptions']:[]),'--lock-wait-timeout=2000',
        '--snapshot='+requested.snapshotId,...requested.schemas.map(s=>'--schema='+s)];
      hold(canonical(allowed)===canonical(requested.args)&&requested.schemas.every(s=>plan.schemas.includes(s)),'dump_transport_scope');
      await inspect();
      const input=passwordInput();try{yield await runPrivateProcess('docker',[...prefix,'/usr/lib/postgresql/17/bin/pg_dump',...allowed],{...options,input});}finally{input?.fill(0);}
    },
    async close({rollback=true}={}){
      if(closed)return;
      let failed=false;
      try {
        if(managed){
          hold(!dead&&rollback,'managed_cleanup_uncertain');
          const siblings=Number((await request("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+applicationName+"' AND usename='postgres' AND pid<>pg_backend_pid();",{timeoutMs:2000,maxBytes:1024})).toString().trim());
          hold(siblings===0,'managed_dump_sessions_remaining');
        }
        if(!dead&&rollback){await request('ROLLBACK;', {timeoutMs:2000,maxBytes:1024});transport.rollbackVerified=true;}
        if(!dead)child.stdin.end('\\q\n');
        else child.kill();
        const exitCode=await Promise.race([exit,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new ExportHold('postgres_close_timeout')),2000);t.unref();})]);
        if(managed)hold(exitCode===0&&transport.rollbackVerified,'managed_cleanup_uncertain');
      }catch{failed=true;child.kill();}
      finally{closed=true;transport.closed=true;}
      // docker exec termination is not proof that its server session ended.
      // Query the isolated fixture admin socket and terminate only this
      // transport's sessions, including an interrupted pg_dump subprocess.
      if(transport.backendPid&&!client){
        const scope="application_name='"+applicationName+"' AND usename='"+role+"'";
        const check=async()=>Number((await runPrivateProcess('docker',['exec','-i',container,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
          {input:Buffer.from('SELECT count(*) FROM pg_stat_activity WHERE '+scope+';'),timeoutMs:2000,maxBytes:1024})).toString().trim());
        if(await check()){
          await runPrivateProcess('docker',['exec','-i',container,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
            {input:Buffer.from('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE '+scope+';'),timeoutMs:2000,maxBytes:1024});
          if(await check())failed=true;
        }
      }
      if(client){try{await inspect();await runPrivateProcess('docker',['rm','--force',container],{timeoutMs:2000});}catch{failed=true;}}
      if(failed)throw new ExportHold('postgres_cleanup_failed');
    },
  };
  try {
    // Actual successful verify-full connection, not caller-supplied TLS booleans.
    if(managed)await request('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL search_path=pg_catalog;');
    const peer=JSON.parse((await request("SELECT json_build_object('pid',pg_backend_pid(),'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'role',current_user,'database',current_database());")).toString());
    hold(peer.ssl===true&&peer.role===role&&peer.database==='postgres'&&Number.isSafeInteger(peer.pid),'postgres_identity_failed');
    transport.backendPid=peer.pid;
    if(managed){
      const m=validateManagedExecutionApproval(approval);
      const identity=JSON.parse((await request("SELECT json_build_object('oid',oid::bigint,'bypassRls',rolbypassrls,'serverVersionNum',current_setting('server_version_num'),'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation')) FROM pg_roles WHERE rolname=current_user;")).toString());
      hold(Number.isSafeInteger(identity.oid)&&identity.oid>0&&identity.bypassRls===true&&identity.serverVersionNum===m.serverVersionNum
        &&identity.readOnly==='on'&&identity.isolation==='repeatable read','managed_execution_identity');
      transport.provenance.managedIdentity=identity;
      await request('ROLLBACK;');
    }else if(client||credential){
      const capability=JSON.parse((await request("SELECT json_build_object('unsafe',rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))) FROM pg_roles WHERE rolname=current_user;")).toString());
      hold(capability.unsafe===false,'postgres_principal_privileges');
    }
    if(!client){
    const fixtureIdentity=JSON.parse((await request("SELECT json_build_object('runId',run_id,'kind',evidence_kind) FROM public.h444_fixture_identity;")).toString());
    hold(fixtureIdentity.runId===runId&&fixtureIdentity.kind==='SYNTHETIC_ONLY','postgres_fixture_identity');
    }
    transport.connectionEvidence={...plan.endpoint,hostnameVerified:true,chainVerified:true,psqlSha256:plan.tools.psqlSha256};
    return transport;
  }catch{await transport.close({rollback:false});throw new ExportHold('postgres_tls_or_identity_failed');}
}

async function inspectAcquisitionClient(container,runId,imageId,network='bridge') {
  hold(/^forge-h444-client-[a-f0-9]{16}$/.test(container)&&container.endsWith(runId),'client_identity');
  const [info]=JSON.parse(await runPrivateProcess('docker',['inspect',container]));
  hold(info.State.Running&&info.Config.Labels?.['forge.h444.client']===runId&&info.Image===imageId
    &&info.HostConfig.NetworkMode===network&&info.HostConfig.LogConfig.Type==='none'
    &&info.HostConfig.ReadonlyRootfs&&!info.HostConfig.Privileged&&info.HostConfig.Memory===268435456
    &&Object.keys(info.HostConfig.PortBindings??{}).length===0&&info.Mounts.every(m=>m.Type==='tmpfs'),'client_isolation');
}
export async function createApprovedPostgresTransport(options,{credential,caBytes}) {
  const {plan,authorization,versions,expectedPlanSha256}=options;
  const a=validateAcquisitionAuthorization({...authorization,plan});
  validatePlan(plan,expectedPlanSha256,versions,authorization);
  hold(Buffer.isBuffer(credential)&&credential.length>0&&credential.length<=2048&&!/[\r\n\0]/.test(credential.toString()),'credential_format');
  hold(Buffer.isBuffer(caBytes)&&caBytes.length<=65536&&sha256(caBytes)===plan.endpoint.caSha256,'approved_ca_changed');
  await runPrivateProcess('docker',['info','--format','{{.ServerVersion}}']);
  const imageId=(await runPrivateProcess('docker',['image','inspect',a.clientImageId,'--format','{{.Id}}'])).toString().trim();
  hold(imageId===a.clientImageId,'approved_image_unavailable');
  const client=await createPinnedPostgresClient(imageId,{network:'bridge',caBytes});
  try {
    hold(Date.now()<(options.sessionDeadline??0),'acquisition_deadline');
    return await createPostgresTransport({...options,...client,credential,client:true});
  }catch{
    await client.dispose();
    throw new ExportHold('approved_postgres_connection_failed');
  }
}

// Local client infrastructure only; this function cannot open a database session.
// Offline tests exercise the identical bootstrap with networking disabled.
export async function createPinnedPostgresClient(imageId,{network='none',caBytes}) {
  hold(/^sha256:[a-f0-9]{64}$/.test(imageId)&&['none','bridge'].includes(network)
    &&Buffer.isBuffer(caBytes)&&caBytes.length<=65536,'client_configuration');
  const runId=randomBytes(8).toString('hex'),container='forge-h444-client-'+runId;
  let created=false,disposed=false;
  const dispose=async()=>{
    if(disposed)return;
    // A successful transport close may already have removed this exact client.
    const existing=(await runPrivateProcess('docker',['ps','-aq','--filter','name=^/'+container+'$'])).toString().trim();
    if(existing){await inspectAcquisitionClient(container,runId,imageId,network);await runPrivateProcess('docker',['rm','--force',container]);}
    disposed=true;
  };
  try {
    await runPrivateProcess('docker',['info','--format','{{.ServerVersion}}']);
    await runPrivateProcess('docker',['run','--detach','--pull=never','--name',container,'--label','forge.h444.client='+runId,
      '--network',network,'--log-driver','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
      '--memory','256m','--memory-swap','256m','--cpus','1','--pids-limit','32','--user','65534:65534',
      '--tmpfs','/fixture:rw,noexec,nosuid,size=1048576,mode=0700,uid=65534,gid=65534',
      '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=1048576,mode=0700,uid=65534,gid=65534',
      '--entrypoint','sleep',imageId,'900']);created=true;
    await inspectAcquisitionClient(container,runId,imageId,network);
    await runPrivateProcess('docker',['exec','-i',container,'sh','-c','umask 077; cat > /fixture/ca.crt'],{input:caBytes,maxBytes:1024});
    return {container,runId,imageId,dispose};
  }catch{
    if(created)await dispose();
    throw new ExportHold('client_bootstrap_failed');
  }
}
