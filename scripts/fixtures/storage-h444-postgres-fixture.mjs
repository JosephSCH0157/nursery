// Disposable protocol test fixture, NOT a Forge installation or H/B1 lineage.
// No migrations/history SQL is replayed; even the 444 history rows are generated.
import {randomBytes} from 'node:crypto';
import {canonical,sha256} from '../lib/storage-h444-exporter.mjs';
import {syntheticExportFixture} from './storage-h444-export-source.mjs';
import {runPrivateProcess} from '../lib/storage-h444-process.mjs';
import {inspectFixtureContainer} from '../lib/storage-h444-postgres.mjs';

const literal=s=>"'"+s.replaceAll("'","''")+"'";
const relation=n=>n.split('.').map(s=>'"'+s+'"').join('.');
export async function startSyntheticPostgres(versions) {
  await runPrivateProcess('docker',['info','--format','{{.ServerVersion}}']);
  const imageId=(await runPrivateProcess('docker',['image','inspect','postgres:17','--format','{{.Id}}'])).toString().trim();
  const runId=randomBytes(8).toString('hex'),container='forge-h444-offline-'+runId;
  const source=syntheticExportFixture(versions);
  const setup=`set -eu
mkdir -p /fixture
openssl req -x509 -newkey rsa:2048 -nodes -keyout /fixture/good.key -out /fixture/good.crt -days 1 -subj /CN=fixture.invalid -addext subjectAltName=DNS:fixture.invalid >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -keyout /fixture/other.key -out /fixture/other.crt -days 1 -subj /CN=wrong.invalid -addext subjectAltName=DNS:wrong.invalid >/dev/null 2>&1
cp /fixture/good.crt /fixture/server.crt
cp /fixture/good.key /fixture/server.key
cp /fixture/good.crt /fixture/ca.crt
chown -R postgres:postgres /fixture
chmod 600 /fixture/*.key
exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/fixture/server.crt -c ssl_key_file=/fixture/server.key -c listen_addresses=127.0.0.1 -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse -c log_min_messages=panic`;
  const fixture={...source,container,runId,imageId,
    async exec(args,options){return runPrivateProcess('docker',['exec','-i',container,...args],options);},
    async admin(sql){return this.exec(['/usr/lib/postgresql/17/bin/psql','-XqAt','-h','/var/run/postgresql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:Buffer.from(sql),maxBytes:1024*1024});},
    async fingerprint(path){return (await this.exec(['sha256sum',path])).toString().split(/\s/)[0];},
    async stop(){
      // Only this run's labeled disposable container may be removed.
      await inspectFixtureContainer(container,runId,imageId);
      await runPrivateProcess('docker',['rm','--force',container]);
    },
  };
  let created=false;
  try {
    await runPrivateProcess('docker',['run','--detach','--pull=never','--name',container,'--label','forge.h444.offline='+runId,
      '--network','none','--log-driver','none','--memory','512m','--cpus','1',
      '--tmpfs','/var/lib/postgresql/data:rw,size=268435456','--tmpfs','/fixture:rw,size=4194304',
      '--tmpfs','/var/run/postgresql:rw,size=4194304','--env','POSTGRES_HOST_AUTH_METHOD=trust','--entrypoint','sh',imageId,'-c',setup]);
    created=true;
    for(let attempt=0;;attempt++){
      try{await fixture.exec(['/usr/lib/postgresql/17/bin/psql','-XqAt','-h','127.0.0.1','-U','postgres','-d','postgres','-c','SELECT 1;']);break;}catch(e){if(attempt>=30)throw e;await new Promise(r=>setTimeout(r,500));}
    }
    const sql=["SET standard_conforming_strings=on; CREATE ROLE fixture_reader LOGIN; ALTER ROLE fixture_reader SET default_transaction_read_only=on;",
      'CREATE TABLE public.h444_fixture_identity(run_id text,evidence_kind text); INSERT INTO public.h444_fixture_identity VALUES ('+literal(runId)+",'SYNTHETIC_ONLY'); GRANT SELECT ON public.h444_fixture_identity TO fixture_reader;"];
    for(const schema of source.plan.schemas)sql.push('CREATE SCHEMA '+relation(schema)+';');
    for(const table of source.plan.tables){
      const example=source.transport.rows.get(table.name)[0];
      const columns=table.columns.map(c=>'"'+c+'" '+(typeof example[c]==='boolean'?'boolean':typeof example[c]==='number'?'integer':example[c]!==null&&typeof example[c]==='object'?'jsonb':'text'));
      sql.push('CREATE TABLE '+relation(table.name)+' ('+columns.join(',')+');');
      for(const row of source.transport.rows.get(table.name))sql.push('INSERT INTO '+relation(table.name)+' SELECT * FROM jsonb_populate_record(NULL::'+relation(table.name)+','+literal(canonical(row))+'::jsonb);');
    }
    sql.push("CREATE FUNCTION tongs._current_financial_environment() RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT 'test'::text$$;",
      'CREATE SEQUENCE tongs.fixture_sequence START 9007199254740993;',
      'CREATE SCHEMA auth; CREATE TABLE auth.users(id text,encrypted_password text);',
      "INSERT INTO auth.users VALUES ('synthetic','DO_NOT_EXPORT_SYNTHETIC_AUTH_SECRET');");
    for(const schema of source.plan.schemas)sql.push('GRANT USAGE ON SCHEMA '+relation(schema)+' TO fixture_reader; GRANT SELECT ON ALL TABLES IN SCHEMA '+relation(schema)+' TO fixture_reader; GRANT SELECT ON ALL SEQUENCES IN SCHEMA '+relation(schema)+' TO fixture_reader;');
    await fixture.admin(sql.join('\n'));
    fixture.plan=structuredClone(source.plan);
    fixture.plan.tools.psqlSha256=await fixture.fingerprint('/usr/lib/postgresql/17/bin/psql');
    fixture.plan.tools.pgDumpSha256=await fixture.fingerprint('/usr/lib/postgresql/17/bin/pg_dump');
    fixture.plan.endpoint.caFile='/fixture/ca.crt';fixture.plan.endpoint.caSha256=await fixture.fingerprint('/fixture/ca.crt');
    fixture.expectedPlanSha256=sha256(canonical(fixture.plan));
    return fixture;
  }catch(e){if(created)await fixture.stop();throw e;}
}
