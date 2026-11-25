// Existing offline entrypoint plus separately approved authentic acquisition.
// Publication of this code is not permission to connect or acquire evidence.
import {lstat,readdir,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createLocalPostgresTransport,createApprovedPostgresTransport} from './storage-h444-postgres.mjs';
import {collectH444Export,validatePlan,ExportHold,sha256,canonical} from './storage-h444-exporter.mjs';
import {verifyOutputDirectory,writeEncryptedExport,writeEncryptedMetadataEvidence,clearExportBundle,dpapiKey} from './storage-h444-output.mjs';
import {validateAcquisitionAuthorization} from './storage-h444-authorization.mjs';
import {acquirePreservedBodies} from './storage-h444-preserved-bodies.mjs';
import {ACQUISITION_INTERVENTION_SCHEMA,validateInterventionReceipt} from './storage-quench-intervention.mjs';
import {randomBytes} from 'node:crypto';
import {isManagedAcquisition,managedInterventionContext,validateManagedRecovery} from './storage-h444-managed.mjs';

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

export async function validateAcquisitionPackage(request) {
  const {plan,authorization,versions,receiptBytes,inventoryBytes,caBytes}=request;
  const synthetic=plan.evidenceKind==='synthetic-offline';
  const a=validateAcquisitionAuthorization({...authorization,plan,synthetic});
  validatePlan(plan,a.planSha256,versions,authorization);
  if(a.schema===ACQUISITION_INTERVENTION_SCHEMA||isManagedAcquisition(a))validateInterventionReceipt(request.interventionReceiptBytes,a.intervention,managedInterventionContext(a));
  else if(request.interventionReceiptBytes)throw new ExportHold('intervention_requires_v3');
  if(isManagedAcquisition(a))validateManagedRecovery(request.recoveryEvidenceBytes,a);
  else if(request.recoveryEvidenceBytes)throw new ExportHold('recovery_requires_v4');
  if(!Buffer.isBuffer(receiptBytes)||sha256(receiptBytes)!==a.bodyReceiptsSha256
    ||!Buffer.isBuffer(inventoryBytes)||sha256(inventoryBytes)!==a.inventorySha256
    ||!Buffer.isBuffer(caBytes)||sha256(caBytes)!==plan.endpoint.caSha256)throw new ExportHold('acquisition_package_changed');
  await verifyOutputDirectory(a.destination);
  if((await readdir(a.destination)).length)throw new ExportHold('acquisition_destination_not_empty');
  return a;
}

// One acquisition coordinator, with an explicitly labeled offline route. It
// cannot receive caller-supplied transports or SQL. The authentic route uses
// the direct endpoint pinned by the independently delivered approval digest.
export async function runApprovedH444Acquisition(request,options={}) {
  try{return await executeApprovedAcquisition(request,options);}finally{options.credential?.fill(0);}
}
async function executeApprovedAcquisition(request,{credential,fixture,signal}={}) {
  let transport,bundle,key,recovered;
  const synthetic=request.plan.evidenceKind==='synthetic-offline';
  const a=await validateAcquisitionPackage(request);
  if(signal?.aborted)throw new ExportHold('acquisition_interrupted');
  if(synthetic ? !fixture || fixture.mode!=='synthetic-offline' : !!fixture)throw new ExportHold('acquisition_transport_scope');
  const deadline=Date.now()+a.limits.sessionMs;
  // Verify key wrapping/recovery BEFORE any source session is created.
  try{key=randomBytes(32);recovered=await dpapiKey('Unprotect',await dpapiKey('Protect',key));if(!key.equals(recovered))throw new ExportHold('key_recovery_failed');}
  finally{key?.fill(0);recovered?.fill(0);}
  // Exclusive attempt consumption precedes connection; failures are never retried
  // automatically. Destination must remain intact for independent reconciliation.
  const journal=await open(join(a.destination,'attempt.json'),'wx',0o600);
  try{await journal.writeFile(canonical({schema:'forge.h444-acquisition-attempt.v1',candidate:a.candidate,
    approvalSha256:request.authorization.approvedSha256,startedAt:new Date().toISOString(),state:'CONSUMED_NO_AUTOMATIC_RETRY'}));await journal.sync();}
  finally{await journal.close();}
  const interrupt=()=>{void transport?.close().catch(()=>{});};
  signal?.addEventListener('abort',interrupt,{once:true});
  try {
    if(signal?.aborted)throw new ExportHold('acquisition_interrupted');
    if(Date.now()>=deadline)throw new ExportHold('acquisition_deadline');
    transport=synthetic?await createLocalPostgresTransport({...fixture,plan:request.plan,expectedPlanSha256:a.planSha256,credential,authorization:request.authorization})
      :await createApprovedPostgresTransport({...request,expectedPlanSha256:a.planSha256,sessionDeadline:deadline},{credential,caBytes:request.caBytes});
    if(signal?.aborted)throw new ExportHold('acquisition_interrupted');
    bundle=await collectH444Export({...request,mode:synthetic?'synthetic-offline':'authentic-acquisition',transport,
      expectedPlanSha256:a.planSha256,limits:a.limits,sessionDeadline:deadline,
      acquireBodies:(objects,snapshotId)=>acquirePreservedBodies({directory:a.bodyDirectory,receiptBytes:request.receiptBytes,
        approvalBytes:request.authorization.approvalBytes,approvedSha256:request.authorization.approvedSha256,objects,snapshotId})});
    if(signal?.aborted)throw new ExportHold('acquisition_interrupted');
    if(Date.now()>=deadline||Date.now()>=Date.parse(a.expiresAt))throw new ExportHold('acquisition_deadline');
    const result=await writeEncryptedExport(bundle,a.destination,'evidence.h444enc',{signal});
    if(signal?.aborted)throw new ExportHold('acquisition_interrupted');
    if(Date.now()>=deadline||Date.now()>=Date.parse(a.expiresAt))throw new ExportHold('acquisition_deadline');
    if(isManagedAcquisition(a)){
      if(!transport.closed||!transport.rollbackVerified)throw new ExportHold('managed_cleanup_uncertain');
      const bytes=Buffer.from(canonical({schema:'forge.h444-managed-execution-receipt.v1',approvalSha256:request.authorization.approvedSha256,
        candidate:a.candidate,mode:'CONTROLLED_READ_ONLY_EXECUTION',credentialReadOnly:false,backendPid:transport.backendPid,
        applicationName:transport.applicationName,rollbackVerified:true,clientClosed:true,dumpSessionsRemaining:0,
        encryptedEvidenceSha256:result.sha256,completedAt:new Date().toISOString(),restorationApproved:false,requiresIndependentReview:true}));
      try{await writeEncryptedMetadataEvidence(bytes,a.destination,'execution-receipt.h444enc',{signal});}finally{bytes.fill(0);}
      if(Date.now()>=Date.parse(a.expiresAt))throw new ExportHold('acquisition_deadline');
    }
    return {...result,storageObjectCount:475,storageBytes:447475,restorationApproved:false};
  }catch(e){throw e instanceof ExportHold?e:new ExportHold('acquisition_failed');}
  finally{try{await transport?.close();}finally{signal?.removeEventListener('abort',interrupt);credential?.fill(0);clearExportBundle(bundle);}}
}
