import {startSyntheticPostgres} from './storage-h444-postgres-fixture.mjs';
import {h444Versions} from '../lib/storage-h444-preflight.mjs';

// Reuse the generated fixture, then remove all data privileges the preflight does
// not need. In particular, financial/Storage rows and five history payload columns
// cannot be read even if accidentally added to a query.
export async function startPreflightFixture(){
  const f=await startSyntheticPostgres(h444Versions());
  try{
    f.psqlVersion=(await f.exec(['/usr/lib/postgresql/17/bin/psql','--version'])).toString().trim();
    f.libpqSha256=await f.fingerprint('/usr/lib/x86_64-linux-gnu/libpq.so.5');
    for(const schema of f.plan.schemas){
      await f.admin(`REVOKE SELECT ON ALL TABLES IN SCHEMA "${schema}" FROM fixture_reader; REVOKE SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" FROM fixture_reader;`);
    }
    await f.admin('GRANT SELECT(singleton,lineage) ON forge_meta.database_lineage TO fixture_reader; GRANT SELECT(version) ON supabase_migrations.schema_migrations TO fixture_reader;');
    return f;
  }catch(e){await f.stop();throw e;}
}
