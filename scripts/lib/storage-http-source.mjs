import assert from 'node:assert/strict';

// Inspect only the supplied disposable stack; never borrow another project's
// Storage image/configuration or redirect an unexpected database connection.
export function discoverStorageHttpSource(run,databaseContainer) {
 assert.match(databaseContainer??'',/^supabase_db_forge-[a-zA-Z0-9_-]+$/);
 const inspect=name=>{
  const rows=JSON.parse(run(['inspect',name]));
  assert.equal(rows.length,1,'Expected exactly one container');
  assert.equal(rows[0].Name,'/'+name,'Container identity mismatch');
  return rows[0];
 };
 const parent=inspect(databaseContainer);
 const project=parent.Config.Labels['com.supabase.cli.project'];
 assert.match(project??'',/^forge-[a-zA-Z0-9_-]+$/);
 assert.equal(databaseContainer,'supabase_db_'+project,'Database project mismatch');
 const network='supabase_network_'+project;
 assert.deepEqual(Object.keys(parent.NetworkSettings.Networks),[network],'Database network mismatch');
 const source=inspect('supabase_storage_'+project);
 assert.equal(source.Config.Labels['com.supabase.cli.project'],project,'Storage project mismatch');
 assert.deepEqual(Object.keys(source.NetworkSettings.Networks),[network],'Storage network mismatch');
 const networkId=parent.NetworkSettings.Networks[network].NetworkID;
 assert.ok(typeof networkId==='string' && networkId.length>0,'Missing database network identity');
 assert.equal(source.NetworkSettings.Networks[network].NetworkID,networkId,'Network identity mismatch');
 const env=Object.fromEntries(source.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
 let db;
 try{db=new URL(env.DATABASE_URL);}catch{throw Error('Invalid Storage database URL (credentials suppressed)');}
 assert.ok(['postgres:','postgresql:'].includes(db.protocol),'Unexpected database protocol');
 assert.equal(db.hostname,databaseContainer,'Storage database host mismatch');
 assert.ok(db.port==='' || db.port==='5432','Unexpected database port');
 assert.equal(db.pathname,'/postgres','Unexpected source database');
 return {source,env,db,project};
}
