// Invoked only by the supervised credential launcher after new owner approval.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ExportHold,canonical} from './lib/storage-h444-exporter.mjs';
import {validateAcquisitionPackage,runApprovedH444Acquisition} from './lib/storage-h444-acquisition.mjs';
import {isManagedAcquisition} from './lib/storage-h444-managed.mjs';
import {decryptMetadataEvidence} from './lib/storage-h444-output.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
async function boundedFile(path,max) {
  const full=resolve(path),stat=await lstat(full);
  hold(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max&&(await realpath(full)).toLowerCase()===full.toLowerCase(),'package_file');
  const bytes=await readFile(full);hold(bytes.length<=max,'package_file_bound');return bytes;
}
async function credentialInput() {
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    const finish=(error)=>{clearTimeout(timer);process.stdin.removeAllListeners();process.stdin.pause();
      const bytes=Buffer.concat(chunks);for(const b of chunks)b.fill(0);
      if(error){bytes.fill(0);reject(new ExportHold(error));}else resolve(bytes);};
    const timer=setTimeout(()=>finish('credential_delivery_timeout'),15000);
    process.stdin.on('data',b=>{chunks.push(b);size+=b.length;if(size>2048)finish('credential_delivery_bound');});
    process.stdin.once('error',()=>finish('credential_delivery_failed'));
    process.stdin.once('end',()=>finish(size?'': 'credential_missing'));
  });
}
let credential;const privatePackageBuffers=[];const abort=new AbortController();
process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
try {
  const args=process.argv.slice(2);
  hold(args.length===5&&['--check','--acquire'].includes(args[0])&&args[1]==='--package'&&args[3]==='--approval-sha256','invocation');
  hold(process.platform==='win32','windows_required');
  const p=JSON.parse(await boundedFile(args[2],65536));
  hold(canonical(Object.keys(p).sort())===canonical(['approval','plan','ca','bodyReceipts','inventory',...(Object.hasOwn(p,'interventionReceipt')?['interventionReceipt']:[]),...(Object.hasOwn(p,'recoveryEvidence')?['recoveryEvidence']:[])].sort()),'package_fields');
  const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  hold(git('status','--porcelain')==='','candidate_worktree_not_clean');
  const head=git('rev-parse','HEAD');
  const plan=JSON.parse(await boundedFile(p.plan,1024*1024));
  hold(plan.evidenceKind==='authentic-logical-acquisition','authentic_plan_required');
  const request={plan,authorization:{approvalBytes:await boundedFile(p.approval,65536),approvedSha256:args[4],head},
    versions:JSON.parse(await readFile(new URL('../docs/database/certification/storage-full-tail-446.json',import.meta.url))).migrations.slice(0,444).map(m=>m.version),
    caBytes:await boundedFile(p.ca,65536),receiptBytes:await boundedFile(p.bodyReceipts,1024*1024),inventoryBytes:await boundedFile(p.inventory,8*1024*1024)};
  const managed=isManagedAcquisition(JSON.parse(request.authorization.approvalBytes));
  if(p.interventionReceipt){
    const bytes=await boundedFile(p.interventionReceipt,64*1024*1024);
    request.interventionReceiptBytes=managed?await decryptMetadataEvidence(bytes):bytes;
    if(managed)privatePackageBuffers.push(request.interventionReceiptBytes);
  }
  if(p.recoveryEvidence){
    hold(managed,'recovery_requires_v4');
    const plaintext=await decryptMetadataEvidence(await boundedFile(p.recoveryEvidence,32*1024*1024+65536));
    try{request.recoveryEvidenceBytes=Buffer.from(JSON.stringify(JSON.parse(plaintext).evidence));privatePackageBuffers.push(request.recoveryEvidenceBytes);}
    finally{plaintext.fill(0);}
  }
  const approved=await validateAcquisitionPackage(request);
  if(isManagedAcquisition(approved))git('merge-base','--is-ancestor',approved.managedExecutionApproval.interventionCandidate,head);
  if(args[0]==='--check')process.stdout.write('PACKAGE_VALID_NO_CONNECTION\n');
  else {
    hold(!process.stdin.isTTY,'private_credential_pipe_required');
    credential=await credentialInput();
    const result=await runApprovedH444Acquisition(request,{credential,signal:abort.signal});
    process.stdout.write(JSON.stringify({status:'ACQUIRED_REQUIRES_INDEPENDENT_REVIEW',candidate:head,sha256:result.sha256,
      encryptedBytes:result.sizeBytes,artifactCount:6,storageObjectCount:475,restorationApproved:false})+'\n');
  }
}catch(e){process.stderr.write((e instanceof ExportHold?e.message:'acquisition_failed')+'\n');process.exitCode=1;}
finally{credential?.fill(0);for(const bytes of privatePackageBuffers)bytes.fill(0);}
