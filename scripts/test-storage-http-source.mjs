import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverStorageHttpSource} from './lib/storage-http-source.mjs';

function fixture(project='forge-baseline-v1-012345abcdef') {
 const databaseContainer='supabase_db_'+project,storage='supabase_storage_'+project,network='supabase_network_'+project;
 const container=name=>({Name:'/'+name,Config:{Labels:{'com.supabase.cli.project':project},Env:[]},NetworkSettings:{Networks:{[network]:{NetworkID:'isolated-network'}}}});
 const parent=container(databaseContainer),source=container(storage);
 source.Image='sha256:existing-local-image';
 source.Config.Env=[`DATABASE_URL=postgresql://supabase_storage_admin:synthetic@${databaseContainer}:5432/postgres`,'DB_MIGRATIONS_FREEZE_AT=reviewed'];
 const inspected=[];
 const run=args=>{
  assert.equal(args[0],'inspect','Discovery must remain read-only');
  inspected.push(args[1]);
  if(args[1]===databaseContainer)return JSON.stringify([parent]);
  if(args[1]===storage)return JSON.stringify([source]);
  throw Error('Unrelated container unavailable');
 };
 return {databaseContainer,storage,network,parent,source,inspected,run};
}
for(const project of ['forge-baseline-v1-012345abcdef','forge-baseline-v1-fedcba543210','forge-gate-e1-pre']) {
 test(`discovers only the supplied stack: ${project}`,()=>{
  const f=fixture(project),r=discoverStorageHttpSource(f.run,f.databaseContainer);
  assert.deepEqual(f.inspected,[f.databaseContainer,f.storage]);
  assert.equal(r.project,project);assert.equal(r.db.hostname,f.databaseContainer);
  assert.equal(r.db.pathname,'/postgres');assert.equal(r.source.Image,f.source.Image);
  assert.equal(r.env.DB_MIGRATIONS_FREEZE_AT,'reviewed');
 });
}
const bad={
 'database label':f=>{f.parent.Config.Labels['com.supabase.cli.project']='forge-other';},
 'database name':f=>{f.parent.Name='/supabase_db_forge-other';},
 'storage label':f=>{f.source.Config.Labels['com.supabase.cli.project']='forge-other';},
 'storage name':f=>{f.source.Name='/supabase_storage_forge-other';},
 'database network':f=>{f.parent.NetworkSettings.Networks={unrelated:{NetworkID:'isolated-network'}};},
 'storage network':f=>{f.source.NetworkSettings.Networks={unrelated:{NetworkID:'isolated-network'}};},
 'extra network':f=>{f.source.NetworkSettings.Networks.bridge={NetworkID:'other'};},
 'extra database network':f=>{f.parent.NetworkSettings.Networks.bridge={NetworkID:'other'};},
 'network identity':f=>{f.source.NetworkSettings.Networks[f.network].NetworkID='different';},
 'missing network identity':f=>{delete f.parent.NetworkSettings.Networks[f.network].NetworkID;},
 'database host':f=>{f.source.Config.Env[0]=f.source.Config.Env[0].replace(f.databaseContainer,'supabase_db_forge-other');},
 'database name in URL':f=>{f.source.Config.Env[0]=f.source.Config.Env[0].replace('/postgres','/customer');},
 'database port':f=>{f.source.Config.Env[0]=f.source.Config.Env[0].replace(':5432',':6543');},
 'database protocol':f=>{f.source.Config.Env[0]=f.source.Config.Env[0].replace('postgresql:','https:');},
};
for(const [name,mutate] of Object.entries(bad))test(`rejects mismatched ${name} before launch`,()=>{
 const f=fixture();mutate(f);assert.throws(()=>discoverStorageHttpSource(f.run,f.databaseContainer));
});
test('requires explicit Forge container and rejects missing/ambiguous inspect results',()=>{
 for(const name of [undefined,'supabase_db_nursery','supabase_db_forge-../other'])assert.throws(()=>discoverStorageHttpSource(()=>assert.fail('must not inspect'),name));
 const f=fixture();
 for(const rows of [[],[f.parent,f.parent]])assert.throws(()=>discoverStorageHttpSource(()=>JSON.stringify(rows),f.databaseContainer));
});
test('invalid database URL diagnostics do not expose credentials',()=>{
 const f=fixture();f.source.Config.Env=['DATABASE_URL=not-a-url-with-private-password'];
 assert.throws(()=>discoverStorageHttpSource(f.run,f.databaseContainer),error=>{
  assert.equal(error.message,'Invalid Storage database URL (credentials suppressed)');
  assert.equal(error.input,undefined);return true;
 });
});
