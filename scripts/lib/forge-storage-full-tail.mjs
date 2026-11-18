import {readFileSync,writeFileSync,readdirSync,existsSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export function validateContract(c){
 if(c.sourceCandidate!=='674011bf88f8f6d179e362fd394dda49b38e155f'||c.historicalAnchor!=='20261018120000'||c.historicalAnchorCount!==411||c.schema!=='forge.storage-full-tail-contract.v1'||c.target!=='20261113214832'||c.migrations.length!==446||c.baselineCount!==33)throw Error('Unreviewed full-tail contract');
 const versions=c.migrations.map(x=>x.version);
 if(new Set(versions).size!==446||JSON.stringify([...versions].sort())!==JSON.stringify(versions)||versions.at(-1)!==c.target)throw Error('Invalid migration membership/order');
 for(const f of c.migrations)if(!/^supabase\/migrations\/\d{8,14}_[a-zA-Z0-9_]+\.sql$/.test(f.path)||!f.path.split('/').at(-1).startsWith(f.version+'_')||!/^[0-9a-f]{64}$/.test(f.sha256))throw Error('Invalid migration identity');
 return c;
}
export function pendingVersions(c,lineage,after,through=c.target){
 if(!['historical','baseline'].includes(lineage))throw Error('Explicit supported lineage required');
 return c.migrations.filter(f=>f.version>after&&f.version<=through&&(lineage==='historical'||f.version>='20261022000000')).map(f=>f.version);
}
export function exactPending(actual,expected){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Full-tail pending prefix differs: '+actual.join(','));}
export function readPinned(root){
 const git=(...a)=>execFileSync('git',['-C',root,...a],{env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},maxBuffer:150*1024*1024});
 const c=validateContract(JSON.parse(readFileSync(join(root,'docs/database/certification/storage-full-tail-446.json'))));
 git('merge-base','--is-ancestor',c.sourceCandidate,'HEAD');
 const listed=git('ls-tree','-r','--name-only','HEAD','--','supabase/migrations').toString().trim().split('\n').filter(p=>/\/\d{8,14}_[^/]+\.sql$/.test(p));
 if(JSON.stringify(listed)!==JSON.stringify(c.migrations.map(f=>f.path)))throw Error('Full migration set differs from pinned contract');
 const all=[...c.migrations,...Object.entries(c.templatesAndFixtures).map(([path,sha256])=>({path,sha256}))];
 const raw=execFileSync('git',['-C',root,'cat-file','--batch'],{input:all.map(f=>'HEAD:'+f.path+'\n').join(''),env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},maxBuffer:150*1024*1024});
 let offset=0;const blobs=new Map();
 for(const f of all){const end=raw.indexOf(10,offset),header=raw.subarray(offset,end).toString();const match=/^[0-9a-f]{40} blob (\d+)$/.exec(header);if(!match)throw Error('Missing pinned Git blob: '+f.path);const size=Number(match[1]),bytes=raw.subarray(end+1,end+1+size);offset=end+size+2;if(digest(bytes)!==f.sha256)throw Error('Frozen byte identity differs: '+f.path);blobs.set(f.path,bytes);}
 return {contract:c,blobs,head:git('rev-parse','HEAD').toString().trim()};
}
export function stage(root,workdir,lineage,through){
 const {contract:c,blobs}=readPinned(root);const real=realpathSync(workdir);
 if(!real.startsWith(realpathSync(tmpdir())+'/')||!/(forge-baseline-v1-cert-|forge-gate5d-lane-)/.test(real)||realpathSync(root)===real)throw Error('Only governed disposable migration workdirs are allowed');
 if(!['historical','baseline'].includes(lineage)||!c.migrations.some(f=>f.version===through))throw Error('Unpinned lineage/stage');
 const directory=join(real,'supabase/migrations');const baseline='database/canonical-baseline-v1/supabase/migrations/20261021020814_canonical_baseline_v1.sql';
 const all=c.migrations.filter(f=>lineage==='historical'||f.version>='20261022000000');
 if(lineage==='baseline')all.unshift({path:baseline,version:'20261021020814',sha256:c.templatesAndFixtures[baseline]});
 const names=new Set(all.map(f=>basename(f.path)));
 for(const n of readdirSync(directory)){if(!n.endsWith('.sql'))continue;if(!names.has(n))throw Error('Unexpected staged SQL: '+n);const f=all.find(x=>basename(x.path)===n);if(digest(readFileSync(join(directory,n)))!==f.sha256)throw Error('Staged bytes changed: '+n);}
 for(const f of all){const target=join(directory,basename(f.path));if(f.version<=through)writeFileSync(target,blobs.get(f.path));else if(existsSync(target))unlinkSync(target);}
 const expected=all.filter(f=>f.version<=through).map(f=>basename(f.path)).sort();exactPending(readdirSync(directory).filter(n=>n.endsWith('.sql')).sort(),expected);
 return {lineage,through,count:expected.length,versions:all.filter(f=>f.version<=through).map(f=>f.version)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,v)=>i%2?a:[...a,[x.replace(/^--/,''),v[i+1]]],[]));
 const root=resolve(args.root??process.cwd());
 if(args.action==='stage')console.log(JSON.stringify(stage(root,args.workdir,args.lineage,args.through)));
 else if(args.action==='template'){const p=readPinned(root);if(!Object.hasOwn(p.contract.templatesAndFixtures,args.path))throw Error('Unpinned template');writeFileSync(args.output,p.blobs.get(args.path));}
 else if(args.action==='pending'){const c=readPinned(root).contract;console.log(JSON.stringify(pendingVersions(c,args.lineage,args.after,args.through)));}
 else {const p=readPinned(root);console.log(JSON.stringify({ok:true,head:p.head,target:p.contract.target,historicalCount:446,baselineCount:33}));}
}
