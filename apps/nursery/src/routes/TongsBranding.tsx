import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { BrandAssetRole, BrandRules } from "@forge/shared";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { appendBrandProfileRevision, clearDefaultBrandProfile, createBrandProfile, defaultBrandRules, loadBrandLibrary, renameBrandProfile, setBrandProfileArchived, setDefaultBrandProfile, uploadBrandAssetRevision, type BrandLibraryProjection } from "../lib/brand-library";

export default function TongsBranding() {
  const { workspaceId } = useOutletContext<AppShellContext>();
  const [library,setLibrary]=useState<BrandLibraryProjection|null>(null); const [error,setError]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null); const [newLabel,setNewLabel]=useState(""); const [draft,setDraft]=useState<BrandRules>(defaultBrandRules());
  const [assetRole,setAssetRole]=useState<BrandAssetRole>("primary_logo");
  const reload=async()=>{ if(!workspaceId)return; try{const next=await loadBrandLibrary(workspaceId);setLibrary(next);setSelectedId((current)=>current??next.profiles.find((p)=>!p.archived_at)?.id??null);setError(null);}catch(reason){setError(reason instanceof Error?reason.message:"Unable to load Brand Library.");}};
  useEffect(()=>{void reload();},[workspaceId]);
  const selected=library?.profiles.find((entry)=>entry.id===selectedId)??null;
  const revisions=useMemo(()=>library?.revisions.filter((entry)=>entry.profile_id===selectedId).sort((a,b)=>b.revision-a.revision)??[],[library,selectedId]);
  useEffect(()=>{if(revisions[0])setDraft(structuredClone(revisions[0].rules));},[revisions[0]?.id]);
  if(!workspaceId)return <WorkspaceRequiredNotice toolName="Tongs Branding"/>;
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();await reload();setError(null);}catch(reason){setError(reason instanceof Error?reason.message:"Brand operation failed.");}finally{setBusy(false);}};
  return <section className="tongs-storage-page" aria-label="Workspace Brand Library">
    <header><h2>Workspace Brand Library</h2><p>Tongs owns canonical brand profiles, immutable content revisions, assets, defaults, and package bindings.</p></header>
    {error?<div className="tongs-storage-error">{error}</div>:null}
    <div className="tongs-storage-grid">
      <aside className="tongs-storage-card"><h3>Brand Profiles</h3><p>Zero or one workspace default is valid.</p>
        <label>New profile label<input value={newLabel} onChange={(e)=>setNewLabel(e.target.value)}/></label>
        <button disabled={busy||!newLabel.trim()} onClick={()=>void run(async()=>{await createBrandProfile(workspaceId,newLabel,defaultBrandRules(newLabel));setNewLabel("");})}>Create profile</button>
        <div>{library?.profiles.map((profile)=><button key={profile.id} className={profile.id===selectedId?"is-active":""} onClick={()=>setSelectedId(profile.id)}>{profile.internal_label}{profile.is_default?" · Default":""}{profile.archived_at?" · Archived":""}</button>)}</div>
        <button disabled={busy||!library?.profiles.some((p)=>p.is_default)} onClick={()=>void run(()=>clearDefaultBrandProfile(workspaceId))}>Clear workspace default</button>
      </aside>
      <main className="tongs-storage-card">{selected?<>
        <div><h3>{selected.internal_label}</h3><span>{revisions[0]?.validation?.bindable?"Bindable":"Not bindable"} · revision {revisions[0]?.revision??0}</span></div>
        <label>Internal label<input value={selected.internal_label} onChange={(e)=>setLibrary((current)=>current?{...current,profiles:current.profiles.map((p)=>p.id===selected.id?{...p,internal_label:e.target.value}:p)}:current)}/></label>
        <button disabled={busy} onClick={()=>void run(()=>renameBrandProfile(workspaceId,selected.id,selected.internal_label))}>Save label only</button>
        <button disabled={busy||Boolean(selected.archived_at)||!revisions[0]?.validation?.bindable} onClick={()=>void run(()=>setDefaultBrandProfile(workspaceId,selected.id))}>Set as workspace default</button>
        <button disabled={busy} onClick={()=>void run(()=>setBrandProfileArchived({workspaceId,profileId:selected.id,archived:!selected.archived_at,clearDefault:Boolean(selected.is_default)}))}>{selected.archived_at?"Restore profile":"Archive and explicitly clear default"}</button>
        <fieldset><legend>Revisioned public identity and rules</legend>
          <label>Program name<input value={draft.public_identity.program_name} onChange={(e)=>setDraft({...draft,public_identity:{...draft.public_identity,program_name:e.target.value}})}/></label>
          <label>Tagline<input value={draft.public_identity.tagline??""} onChange={(e)=>setDraft({...draft,public_identity:{...draft.public_identity,tagline:e.target.value||null}})}/></label>
          {(["primary","secondary","accent"] as const).map((key)=><label key={key}>{key} color<input type="color" value={draft.palette[key]} onChange={(e)=>setDraft({...draft,palette:{...draft.palette,[key]:e.target.value}})}/></label>)}
          <label>Heading family<input value={draft.typography.heading_family} onChange={(e)=>setDraft({...draft,typography:{...draft.typography,heading_family:e.target.value}})}/></label>
          <label>Body family<input value={draft.typography.body_family} onChange={(e)=>setDraft({...draft,typography:{...draft.typography,body_family:e.target.value}})}/></label>
          <label>Music volume<input type="range" min="0" max="1" step="0.05" value={draft.audio.music_volume} onChange={(e)=>setDraft({...draft,audio:{...draft.audio,music_volume:Number(e.target.value)}})}/></label>
          <label>Ducking<input type="range" min="0" max="1" step="0.05" value={draft.audio.ducking} onChange={(e)=>setDraft({...draft,audio:{...draft.audio,ducking:Number(e.target.value)}})}/></label>
        </fieldset>
        <button disabled={busy||Boolean(selected.archived_at)} onClick={()=>void run(()=>appendBrandProfileRevision(workspaceId,selected.id,draft))}>Save immutable brand revision</button>
        <details><summary>Revision history ({revisions.length})</summary>{revisions.map((revision)=><article key={revision.id}><strong>Revision {revision.revision}</strong><span>{revision.validation?.bindable?"Bind­able":"Ineligible"} · {revision.content_hash.slice(0,12)}</span>{revision.validation?.errors?.length?<ul>{revision.validation.errors.map((entry)=><li key={entry}>{entry}</li>)}</ul>:null}</article>)}</details>
        <section><h3>Brand assets</h3><p>Assets are revisioned independently. Upload readback must verify before a revision becomes ready; attach it by saving a new profile revision.</p>
          <label>Asset role<select value={assetRole} onChange={(e)=>setAssetRole(e.target.value as BrandAssetRole)}>{["primary_logo","secondary_logo","alternate_logo","transparent_logo","watermark_logo","intro_media","outro_media","theme_music","intro_stinger","outro_stinger","music_bed"].map((role)=><option key={role}>{role}</option>)}</select></label>
          <input type="file" accept={assetRole.includes("logo")?"image/*":assetRole.includes("media")?"video/*":"audio/*"} disabled={busy||Boolean(selected.archived_at)} onChange={(event)=>{const file=event.target.files?.[0];if(!file)return;void run(async()=>{const revision=await uploadBrandAssetRevision({workspaceId,profileId:selected.id,role:assetRole,label:file.name,file});setDraft((current)=>({...current,asset_revision_ids:{...current.asset_revision_ids,[assetRole]:revision.id}}));});}}/>
          <ul>{(library?.asset_revisions as Array<{id:string;role:string;revision:number;state:string;content_hash?:string|null}>??[]).map((asset)=><li key={asset.id}>{asset.role} · revision {asset.revision} · {asset.state} {asset.content_hash?`· ${asset.content_hash.slice(0,10)}`:""}</li>)}</ul>
        </section>
      </>:<p>Create or select a Brand Profile.</p>}</main>
    </div>
  </section>;
}
