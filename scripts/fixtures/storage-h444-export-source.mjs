// Hermetic protocol fixture: never opens a socket or reads private evidence.
import {FIXTURE_PROJECT,HISTORY_COLUMNS,FINANCIAL_AUTHORITIES,BEGIN_SQL,canonical,sha256,storageIdentityDigest} from '../lib/storage-h444-exporter.mjs';

export function syntheticExportFixture(versions) {
  const storage=Array.from({length:475},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),
    bucket_id:'forge-workpieces',name:'synthetic/'+i,owner:null,owner_id:null,version:'fixture-v1',
    metadata:{size:i===474?967:942,eTag:'synthetic'},user_metadata:{fixture:true},
    created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',last_accessed_at:null}));
  const rows=new Map([
    ['supabase_migrations.schema_migrations',versions.map(version=>({created_by:'SYNTHETIC',idempotency_key:null,name:'fixture',rollback:null,statements:['-- synthetic '+version],version}))],
    ['forge_meta.database_lineage',[{singleton:true,lineage:'historical-v1',historical_manifest_sha256:'a'.repeat(64),baseline_contract_sha256:'b'.repeat(64)}]],
    ['storage.objects',storage],
    ...FINANCIAL_AUTHORITIES.map(([,name,selector])=>[name,[{...selector,payload:'synthetic authority',amount:'0.00'}]]),
  ]);
  const tables=[...rows].map(([name,values])=>({name,columns:name==='supabase_migrations.schema_migrations'?HISTORY_COLUMNS:[...Object.keys(values[0])].sort()}));
  const plan={schema:'forge.h444-export-plan.v1',evidenceKind:'synthetic-offline',sourceProject:FIXTURE_PROJECT,
    candidate:'2847d5106785a572ebaca7b0d5ac23fa0a383bde',historyVersionsSha256:sha256(versions.join('\n')),
    tables,schemas:[...new Set(tables.map(t=>t.name.split('.')[0]))].sort(),financialTables:FINANCIAL_AUTHORITIES.map(a=>a[1]),
    storageIdentitySha256:storageIdentityDigest(storage),tools:{psqlSha256:sha256('synthetic psql'),pgDumpSha256:sha256('synthetic pg_dump')},
    endpoint:{host:'fixture.invalid',port:5432,database:'postgres',sslmode:'verify-full',caFile:'/synthetic/ca.pem',caSha256:sha256('synthetic CA')}};
  const transport={kind:'synthetic-fixture',trace:[],rows,queryCount:0,dumpCount:0,closed:false,inTransaction:false,
    connectionEvidence:{host:plan.endpoint.host,port:5432,database:'postgres',sslmode:'verify-full',hostnameVerified:true,chainVerified:true,caSha256:plan.endpoint.caSha256,psqlSha256:plan.tools.psqlSha256},
    context:{pid:123,snapshot:'400:401:',isolation:'repeatable read',readOnly:'on',database:'postgres',role:'synthetic_reader',serverVersion:'17.6',ssl:true},
    snapshotId:'00000001-00000001-1',privilegeMutation:null,responseMutation:null,rawRowsMutation:null,
    async *query(sql,options) {
      this.queryCount++;this.trace.push({kind:'query',sql,timeoutMs:options.timeoutMs});
      if(options.signal.aborted)throw Error('aborted');
      if(sql===BEGIN_SQL){if(this.inTransaction)throw Error('duplicate transaction');this.inTransaction=true;yield Buffer.from('{}');return;}
      if(!this.inTransaction)throw Error('outside transaction');
      let value;
      if(sql.includes('pg_export_snapshot()'))value={snapshotId:this.snapshotId,at:'2026-11-21T12:00:00.000Z'};
      else if(sql.includes('has_column_privilege')){
        value=plan.tables.map(t=>({name:t.name,columns:t.columns,present:true,schemaUsage:true,selectAll:true,unfiltered:true,actualColumns:[...t.columns]}));
        this.privilegeMutation?.(value);
      }else if(sql.includes('row_to_json(r)::text')){
        const match=/ from "([a-z_]+)"\."([a-z_]+)" limit ([0-9]+)\) r/.exec(sql);if(!match)throw Error('unrecognized projection');
        const name=match[1]+'.'+match[2];value=this.rows.get(name).map(canonical).sort();this.rawRowsMutation?.(name,value);
        value=value.slice(0,Number(match[3]));
        if(sql.includes('octet_length(j)'))value={rowCount:value.length,rawBytes:String(value.reduce((s,r)=>s+Buffer.byteLength(r),0))};
      }else if(sql.includes('tongs._current_financial_environment()'))value=this.financialMode??'test';
      else if(sql.includes('from pg_auth_members'))value={roles:[{name:'synthetic_reader',login:true}],memberships:[],defaultAcls:[]};
      else if(sql.includes('from pg_sequences'))value=[{schema:'tongs',name:'fixture_sequence'}];
      else if(sql.includes('last_value'))value={lastValue:'9007199254740993',isCalled:true,observedAt:'2026-11-21T12:00:00.500Z'};
      else if(sql.includes('select clock_timestamp()'))value='2026-11-21T12:00:01.000Z';
      else throw Error('unexpected query');
      const response={context:{...this.context},value};this.responseMutation?.(response,sql);
      const bytes=Buffer.from(JSON.stringify(response));for(let i=0;i<bytes.length;i+=16384)yield bytes.subarray(i,i+16384);
    },
    async *dump(request,options) {
      this.dumpCount++;this.trace.push({kind:'dump',request,timeoutMs:options.timeoutMs});
      if(!this.inTransaction||request.snapshotId!==this.snapshotId||!request.args.includes('--snapshot='+this.snapshotId))throw Error('dump outside shared snapshot');
      if(request.environment.PGSSLMODE!=='verify-full'||!request.environment.PGOPTIONS.includes('default_transaction_read_only=on'))throw Error('unsafe dump');
      const nonce=this.dumpNonce??'SYNTHETIC123';
      yield Buffer.from('\\restrict '+nonce+'\n-- SYNTHETIC SCHEMA ONLY\nCREATE SCHEMA "'+request.schemas[0]+'";\n\\unrestrict '+nonce+'\n');
    },
    async close({rollback}) {this.trace.push({kind:'close',rollback});this.closed=true;this.inTransaction=false;},
  };
  return {mode:'synthetic-offline',transport,plan,versions,expectedPlanSha256:sha256(canonical(plan))};
}
