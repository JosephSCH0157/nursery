import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// Optional operator-driven stage of the existing guarded disposable DB runner.
// No Stripe mutations here: a separate operator drives the sandbox after READY.
export async function certifyStripeSandbox({ run, sql, database, sourceContainer }) {
 const account='acct_1Spw8m0v1TAfIsgZ';
 const keyFile=process.env.FORGE_STRIPE_SANDBOX_KEY_FILE;
 const cli=process.env.FORGE_STRIPE_CERT_CLI, config=process.env.FORGE_STRIPE_CERT_CONFIG;
 assert.ok(keyFile && cli && config,'Explicit private sandbox key and CLI profile required');
 const cleanEnv={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'};
 const who=spawnSync(cli,['--config',config,'--project-name','forge-storage-cert','whoami','--format','json'],{env:cleanEnv,encoding:'utf8',timeout:15000});
 assert.equal(who.status,0,'CLI identity unavailable');
 const cliIdentity=JSON.parse(who.stdout);
 assert.equal(cliIdentity.account_id,account,'CLI account must be isolated sandbox');
 assert.equal(cliIdentity.mode,'test','CLI must not be Live');
 assert.equal(statSync(keyFile).mode & 0o077,0,'Sandbox key file must be private');
 const key=readFileSync(keyFile,'utf8').trim();
 assert.match(key,/^(rk|sk)_test_[A-Za-z0-9]+$/,'Sandbox-only API credential required');
 const identity=await fetch('https://api.stripe.com/v1/account',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
 assert.equal(identity.status,200,'Sandbox account verification failed');
 assert.equal((await identity.json()).id,account,'Sandbox key account mismatch');
 const dir=mkdtempSync('/tmp/forge-stripe-delivery-');
 const manifest={schema:'forge.stripe-delivery-cert.v1',account,mode:'test',runId:randomUUID(),database,createdAt:new Date().toISOString(),users:[randomUUID(),randomUUID()],containers:[]};
 const save=(name,value)=>writeFileSync(`${dir}/${name}`,JSON.stringify(value,null,2),{mode:0o600});
 save('manifest.json',manifest);
 const secret=randomBytes(32).toString('hex');
 const payload=[{alg:'HS256',typ:'JWT'},{role:'service_role',iss:'forge-disposable',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 const jwt=payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
 for(const id of manifest.users)sql(`insert into auth.users(id) values('${id}');`);
 const info=JSON.parse(run(['inspect',sourceContainer]))[0];
 const password=info.Config.Env.find(v=>v.startsWith('POSTGRES_PASSWORD='))?.slice(18);
 assert.ok(password);
 const dbUrl=new URL(`postgresql://supabase_admin@${sourceContainer}:5432/${database}`);dbUrl.password=password;
 const suffix=randomBytes(5).toString('hex'),rest=`forge-stripe-rest-${suffix}`,gateway=`forge-stripe-gateway-${suffix}`,edge=`forge-stripe-edge-${suffix}`;
 let listener,receiver;
 const events=[];
 const start=(name,args)=>{try{run(['run','--detach','--pull=never','--name',name,...args]);manifest.containers.push(name);save('manifest.json',manifest);}catch{throw Error(`Disposable ${name} start failed; private logs required`);}};
 const gatewayCode=`import http from 'node:http';http.createServer((q,s)=>{if(!q.url.startsWith('/rest/v1/')){s.writeHead(404).end();return;}const p=http.request({host:'127.0.0.1',port:3000,path:q.url.slice(8),method:q.method,headers:q.headers},r=>{s.writeHead(r.statusCode,r.headers);r.pipe(s)});p.on('error',()=>s.writeHead(502).end());q.pipe(p)}).listen(8000,'127.0.0.1');`;
 writeFileSync(`${dir}/gateway.mjs`,gatewayCode,{mode:0o600});
 try {
  start(rest,['--network','supabase_network_forge-gate-e1-pre','--publish','127.0.0.1::9000',
   '--env',`PGRST_DB_URI=${dbUrl.href}`,'--env','PGRST_DB_SCHEMAS=tongs','--env','PGRST_DB_ANON_ROLE=anon','--env',`PGRST_JWT_SECRET=${secret}`,'public.ecr.aws/supabase/postgrest:v13.0.5']);
  start(gateway,['--network',`container:${rest}`,'--mount',`type=bind,src=${dir}/gateway.mjs,dst=/gateway.mjs,readonly`,'node:20.20.0-bookworm-slim','node','/gateway.mjs']);
  const binding=JSON.parse(run(['inspect',rest]))[0].NetworkSettings.Ports['9000/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
  const target=`http://127.0.0.1:${binding.HostPort}`;
  receiver=createServer(async(q,s)=>{
   const chunks=[];for await(const chunk of q)chunks.push(chunk);
   const body=Buffer.concat(chunks),signature=q.headers['stripe-signature'];
   if(q.method!=='POST'||q.url!=='/webhook'||typeof signature!=='string'){s.writeHead(400).end();return;}
   let value;try{value=JSON.parse(body.toString());}catch{s.writeHead(400).end();return;}
   const object=value.data?.object;
   const runId=object?.metadata?.forge_certification_run
    ?? object?.subscription_details?.metadata?.forge_certification_run
    ?? object?.parent?.subscription_details?.metadata?.forge_certification_run;
   if(value.livemode!==false || (value.account && value.account!==account)
      || runId!==manifest.runId){s.writeHead(400).end('Outside exact synthetic certification scope');return;}
   const index=events.length,receivedAt=new Date().toISOString();
   const evidence={index,id:value.id,type:value.type,receivedAt,bodySha256:createHash('sha256').update(body).digest('hex')};
   events.push(evidence);save('events.json',events);
   save(`request-${index}.json`,{body:body.toString(),signature}); // Private original signed bytes for bounded replay.
   try {const r=await fetch(target,{method:'POST',headers:{'stripe-signature':signature,'content-type':'application/json'},body,signal:AbortSignal.timeout(60000)});
    const text=await r.text();Object.assign(evidence,{status:r.status,response:text,completedAt:new Date().toISOString()});save('events.json',events);s.writeHead(r.status).end(text);
   }catch{Object.assign(evidence,{status:502,error:'Local forwarding failed'});save('events.json',events);s.writeHead(502).end();}
  });
  await new Promise(r=>receiver.listen(0,'127.0.0.1',r));
  const port=receiver.address().port;
  const logFd=openSync(`${dir}/listener.log`,'a',0o600);
  listener=spawn(cli,['--config',config,'--project-name','forge-storage-cert','listen','--events-from','@self','--events','customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed','--forward-to',`http://127.0.0.1:${port}/webhook`],{env:cleanEnv,stdio:['ignore',logFd,logFd]});closeSync(logFd);
  let signingSecret;
  for(let i=0;i<60;i++) {signingSecret=readFileSync(`${dir}/listener.log`,'utf8').match(/whsec_[A-Za-z0-9]+/)?.[0];if(signingSecret)break;if(listener.exitCode!==null)throw Error('Stripe listener exited before readiness');await new Promise(r=>setTimeout(r,500));}
  assert.ok(signingSecret,'Sandbox listener signing secret unavailable');
  start(edge,['--network',`container:${rest}`,
   '--mount',`type=bind,src=${resolve('supabase/functions/stripe-webhook')},dst=/app/stripe-webhook,readonly`,
   '--mount',`type=bind,src=${resolve('supabase/functions/_shared')},dst=/app/_shared,readonly`,
   '--env',`STRIPE_SECRET_KEY=${key}`,'--env',`STRIPE_ACCOUNT_ID=${account}`,'--env',`STRIPE_WEBHOOK_SECRET=${signingSecret}`,
   '--env','SUPABASE_URL=http://127.0.0.1:8000','--env',`SUPABASE_SERVICE_ROLE_KEY=${jwt}`,
   'public.ecr.aws/supabase/edge-runtime:v1.73.0','start','--main-service','/app/stripe-webhook']);
  let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(target,{method:'POST',body:'{}',signal:AbortSignal.timeout(1000)});if(r.status===400&&(await r.text()).includes('Signature verification failed')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
  assert.ok(ready,'Unmodified Edge webhook not ready; inspect private sanitized logs');
  const runtime=JSON.parse(run(['inspect',edge]))[0];
  const settings=Object.fromEntries(runtime.Config.Env.map(x=>{const at=x.indexOf('=');return [x.slice(0,at),x.slice(at+1)];}));
  assert.equal(settings.SUPABASE_URL,'http://127.0.0.1:8000');assert.equal(settings.STRIPE_ACCOUNT_ID,account);
  assert.ok(!Object.values(settings).some(v=>v.includes('wtvdjndyxegudufrompx')||v.includes('.supabase.co')||v.startsWith('sk_live_')||v.startsWith('rk_live_')));
  assert.equal(settings.SUPABASE_SERVICE_ROLE_KEY,jwt);
  save('ready.json',{...manifest,receiver:`http://127.0.0.1:${port}/webhook`,signatureRejection:true,originalHandler:true,isolatedServiceJwt:true,sourceHead:'guarded runner inventory',runtimeImage:runtime.Image});
  console.log(JSON.stringify({phase:'stripe-sandbox-ready',evidenceDirectory:dir,database,runId:manifest.runId,users:manifest.users}));
  const deadline=Date.now()+60*60*1000;
  while(!existsSync(`${dir}/finish.json`)) {
   if(listener.exitCode!==null)throw Error('Stripe listener stopped during certification');
   assert.ok(Date.now()<deadline,'Bounded sandbox certification time expired');
   save('projection.json',JSON.parse(sql(`select json_build_object('subscriptions',(select coalesce(json_agg(b),'[]') from tongs.billing_subscriptions b where user_id in ('${manifest.users.join("','")}')),'periods',(select coalesce(json_agg(p),'[]') from tongs.subscription_service_periods p where user_id in ('${manifest.users.join("','")}')));`).trim()));
   await new Promise(r=>setTimeout(r,1000));
  }
  const result=JSON.parse(readFileSync(`${dir}/finish.json`,'utf8'));
  save('result.json',{...result,events});return {evidenceDirectory:dir,...result};
 } finally {
  if(listener && listener.exitCode===null)listener.kill('SIGTERM');
  if(receiver)await new Promise(r=>receiver.close(r));
  for(const name of [...manifest.containers].reverse()) {
   // Preserve runtime diagnostics privately; never print credential-bearing logs.
   try{writeFileSync(`${dir}/${name}.log`,run(['logs',name]),{mode:0o600});}catch{}
   run(['rm','--force',name]);
  }
  save('local-cleanup.json',{containersRemoved:manifest.containers,receiverStopped:true,listenerStopped:true,finishedAt:new Date().toISOString()});
 }
}
