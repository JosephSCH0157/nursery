import {spawn} from 'node:child_process';
import {ExportHold} from './storage-h444-exporter.mjs';

export function localDockerArguments(args) {
  if(process.platform!=='win32')throw new ExportHold('windows_local_docker_required');
  // Do not follow a selected remote Docker context, even if the user changes it.
  return ['--host=npipe:////./pipe/dockerDesktopLinuxEngine',...args];
}

// Only an allowlisted environment crosses process boundaries. Never copy PG*,
// provider credentials, NODE_OPTIONS or arbitrary inherited configuration.
export function localProcessEnvironment() {
  return Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles']
    .filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
}
export function runPrivateProcess(executable,args,{input,timeoutMs=30000,maxBytes=1024*1024,signal}={}) {
  return new Promise((resolve,reject)=>{
    let child,settled=false,length=0,diagnostics=0;const chunks=[];
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(new ExportHold(error)):resolve(result);};
    const abort=()=>{child?.kill();finish('private_process_aborted');};
    const timer=setTimeout(()=>{child?.kill();finish('private_process_timeout');},timeoutMs);
    if(signal?.aborted){abort();return;}
    try {child=spawn(executable,executable==='docker'?localDockerArguments(args):args,{env:localProcessEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch {finish('private_process_failed');return;}
    signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>finish('private_process_failed'));
    child.stdin.on('error',()=>finish('private_process_failed'));
    child.stdout.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){child.kill();finish('private_process_output_limit');}else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{diagnostics+=chunk.length;if(diagnostics>65536){child.kill();finish('private_process_diagnostic_limit');}});
    child.on('close',code=>finish(code===0?null:'private_process_failed',Buffer.concat(chunks)));
    child.stdin.end(input);
  });
}
