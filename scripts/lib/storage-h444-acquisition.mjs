// Offline integration entrypoint. No hosted endpoint, credential or approval
// override exists. The source must be the labeled disposable synthetic fixture.
import {lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createLocalPostgresTransport} from './storage-h444-postgres.mjs';
import {collectH444Export,validatePlan,ExportHold} from './storage-h444-exporter.mjs';
import {verifyOutputDirectory,writeEncryptedExport} from './storage-h444-output.mjs';

export async function runSyntheticH444Acquisition(fixture,{directory,name='evidence.h444enc'}={}) {
  if(fixture.mode!=='synthetic-offline')throw new ExportHold('authentic_acquisition_not_approved');
  validatePlan(fixture.plan,fixture.expectedPlanSha256,fixture.versions);
  if(!/^[a-z0-9-]+\.h444enc$/.test(name))throw new ExportHold('output_name');
  const root=await verifyOutputDirectory(directory);
  try{await lstat(join(root,name));throw new ExportHold('output_already_exists');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const transport=await createLocalPostgresTransport(fixture);let bundle;
  try{
    bundle=await collectH444Export({...fixture,transport});
    return await writeEncryptedExport(bundle,root,name);
  }finally{
    await transport.close();
    if(bundle){for(const bytes of bundle.files.values())bytes.fill(0);bundle.sourceObservationBytes.fill(0);}
  }
}
