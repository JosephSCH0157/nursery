import { test, expect } from 'playwright/test';
import { createHash } from 'node:crypto';
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
for (const empty of [false, true]) test(`initially empty=${empty}: manual editing → conditional Save → verified approval → Ready; reload and unchanged save`,async({page,context})=>{
  let text='[s1]\nInitial script.\n[/s1]\n', revision=empty?0:1, publications=0, approvals=0;
  let loseAcknowledgment=false;
  let draftGate: Promise<void> | null=null;
  const receipts=new Map<string,unknown>();const calls:string[]=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(!url.pathname.includes('/tongs/'))return route.continue();
    const data=request.method()==='POST'?request.postDataJSON():null;calls.push(`${request.method()} ${url.pathname.split('/').at(-1)}`);
    const send=(body:unknown,status=200)=>route.fulfill({status,json:body});
    if(url.pathname.endsWith('/read-file') && revision===0)return send({ok:true,exists:false},404);
    if(url.pathname.endsWith('/read-file'))return send({ok:true,data:text,file_row:{revision,hash_value:digest(text),updated_at:'2026-11-11T00:00:00Z'}});
    if(url.pathname.endsWith('/commit-file')){expect(data.path).toBe('hearth/drafts.v1.json');if(draftGate)await draftGate;return send({ok:true});}
    if(url.pathname.endsWith('/script-publication')){
      if(receipts.has(data.operation_id))return send(receipts.get(data.operation_id));
      if(data.expected_revision!==revision||data.expected_hash!==(revision===0?null:digest(text)))return send({ok:false,data:{state:'conflict'}},409);
      const unchanged=revision>0 && text===data.text;if(!unchanged)revision++;text=data.text;publications++;
      const body={ok:true,data:{state:'committed',receipt:{operation_id:data.operation_id,workspace_id:data.workspace_id,workpiece_id:url.pathname.split('/').at(-2),path:'script/script.md',sha256:digest(text),bytes:Buffer.byteLength(text),revision,unchanged}}};receipts.set(data.operation_id,body);if(loseAcknowledgment){loseAcknowledgment=false;return route.abort();}return send(body);
    }
    if(url.pathname.endsWith('/script-approval')){
      if(request.method()==='GET')return send({ok:true,data:{current_revision:approvals}});
      expect(data.expected_source_file_revision).toBe(revision);expect(data.expected_source_content_hash).toBe(digest(text));approvals++;
      return send({ok:true,data:{disposition:'committed',approval:{id:'local-approval',approval_revision:approvals,script_content_hash:digest(text),source_file_revision:revision}}});
    }
    if(url.pathname.endsWith('/ready-transition'))return send({ok:true,data:{outcome:'saved',ready:{transition_id:'local-ready'}}});
    return route.abort();
  });
  await page.goto('/playwright/fixtures/hearth-script-publication.html');
  if(empty){await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');}
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();
  const stale=await context.newPage();await stale.goto('/playwright/fixtures/hearth-script-publication.html');await expect(stale.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();
  await stale.getByRole('textbox',{name:'Script'}).fill('[s1]\nStale tab edit.\n[/s1]\n');
  await page.getByRole('textbox',{name:'Script'}).fill('[s1]\nManually reviewed text.\n[/s1]\n');
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Autosave',exact:true}).click();expect(publications).toBe(empty?1:0);expect(approvals).toBe(0);
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');
  expect(calls.indexOf('POST commit-file')).toBeLessThan(calls.indexOf('POST script-publication'));
  await stale.getByRole('button',{name:'Save',exact:true}).click();await expect(stale.getByRole('status')).toContainText('Another editor');await expect(stale.getByRole('button',{name:'Approve',exact:true})).toBeDisabled();await stale.getByRole('button',{name:'Reload canonical script'}).click();await expect(stale.getByRole('textbox',{name:'Script'})).toHaveValue(text);await expect(stale.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();await stale.close();
  await page.reload();await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Approve',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Ready');
  const prior=revision;await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');expect(revision).toBe(prior);
  await page.getByRole('textbox',{name:'Script'}).fill('New unreviewed edit');await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeDisabled();expect(approvals).toBe(1);
  loseAcknowledgment=true;
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).not.toHaveText('Saved');
  await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();
  const committedRevision=revision;
  await page.reload();await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');expect(revision).toBe(committedRevision);

  let release!:()=>void;draftGate=new Promise<void>(resolve=>{release=resolve;});
  await page.getByRole('textbox',{name:'Script'}).fill('Frozen save proposal');
  const before=publications;
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
  await page.getByRole('textbox',{name:'Script'}).fill('Newer edit during draft persistence');
  await page.getByRole('button',{name:'Autosave',exact:true}).click();
  release();draftGate=null;
  await expect(page.getByRole('status')).toContainText('editor changed during Save');
  expect(publications).toBe(before);await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeDisabled();

});
