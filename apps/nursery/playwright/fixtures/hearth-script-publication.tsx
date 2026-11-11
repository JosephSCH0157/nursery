import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useHearthScriptPublication } from '../../../hearth/src/hooks/useHearthScriptPublication';
import { commitPublishedScriptApprovalAuthority, markApprovedScriptReady } from '../../../hearth/src/lib/hearth-script-approval-authority';
import { tongsFetch, configureTongsUserAccessTokenResolver } from '../../../hearth/src/lib/tongs-fetch';
import type { Draft } from '../../../hearth/src/domain/draft';
configureTongsUserAccessTokenResolver(async () => 'local-adapter-token');
const workspaceId='a1000000-0000-4000-8000-000000000001',workpieceId='d1000000-0000-4000-8000-000000000001';
export function Harness() {
  const [draft,setDraft]=useState<Draft>(()=>JSON.parse(sessionStorage.getItem('script-ui-draft') ?? 'null') ?? {id:'local-draft',title:'Synthetic script',body:'[s1]\nInitial script.\n[/s1]\n',createdAt:1,updatedAt:1});
  const [status,setStatus]=useState('Draft');
  const latest=useRef(draft);useLayoutEffect(()=>{latest.current=draft;},[draft]);
  const remember=useCallback((id:string,basis:NonNullable<Draft['scriptPublicationBasis']>)=>setDraft(old=>old.id===id?{...old,scriptPublicationBasis:basis}:old),[]);
  const publication=useHearthScriptPublication(workspaceId,workpieceId,draft,remember);
  const persist=async(frozen:Draft)=>{
    const response=await tongsFetch(`/tongs/workpieces/${workpieceId}/commit-file`,{method:'POST',json:{path:'hearth/drafts.v1.json',text:JSON.stringify(frozen)}});
    if(!response.ok) return false;
    sessionStorage.setItem('script-ui-draft',JSON.stringify(frozen));return true;
  };
  async function approve(){
    const frozen=draft.body,ack=publication.acknowledgment;
    if(!ack)return;
    const result=await commitPublishedScriptApprovalAuthority({workspaceId,workpieceId,creatorVersion:1,scriptText:frozen,expectedPublication:ack,isCurrent:()=>latest.current.body===frozen});
    if(!result.ok){setStatus(result.error);return;}
    const ready=await markApprovedScriptReady({workspaceId,workpieceId,authority:result.authority});
    setStatus(ready.ok?'Ready':ready.error);
  }
  return <main><label>Script<textarea value={draft.body} onChange={event=>setDraft({...draft,body:event.target.value})}/></label>
    <button onClick={()=>void publication.save(persist).then(ok=>setStatus(ok?'Saved':'Draft save failed')).catch(error=>setStatus(error.message))} disabled={!publication.canSave}>Save</button>
    <button onClick={()=>void persist(draft)}>Autosave</button>
    <button onClick={()=>void publication.reloadCanonical().then(result=>setDraft(old=>({...old,body:result.text,scriptPublicationBasis:result.basis}))).catch(error=>setStatus(error.message))}>Reload canonical script</button>
    <button disabled={!publication.eligible} onClick={()=>void approve()}>Approve</button><p role="status">{status}</p></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
