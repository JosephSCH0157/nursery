import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useHearthCanonicalThumbnailProjection } from "../src/routes/hearth-shell/useHearthThumbnailController";

const workspaceId="11111111-1111-4111-8111-111111111111";
const workpieceId="22222222-2222-4222-8222-222222222222";
const workspace=(revision:number)=>({episodePackage:{thumbnail:{launch_variant_revisions:[],concept_revisions:[],base_versions:[]},seo:{titles:[],tags:[],description_short:"",description_long:""}},metadataUpdatedAt:`revision-${revision}`}) as never;
const authority=(revision:number,count:number)=>({candidate_set:revision?{revision}:null,candidates:Array.from({length:count},(_,index)=>({id:`candidate-${revision}-${index}`,eligibility_state:"current",asset_path:`thumbnails/${revision}-${index}.png`}))}) as never;

function installDom(){
  const dom=new JSDOM("<!doctype html><div id=\"root\"></div>",{url:"http://localhost/"});
  const previous={window:globalThis.window,document:globalThis.document,navigator:globalThis.navigator};
  Object.defineProperty(globalThis,"window",{configurable:true,value:dom.window});
  Object.defineProperty(globalThis,"document",{configurable:true,value:dom.window.document});
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:dom.window.navigator});
  Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{configurable:true,value:true});
  return{dom,restore(){Object.defineProperty(globalThis,"window",{configurable:true,value:previous.window});Object.defineProperty(globalThis,"document",{configurable:true,value:previous.document});Object.defineProperty(globalThis,"navigator",{configurable:true,value:previous.navigator});dom.window.close();}};
}

test("a candidate mutation refreshes the parent projection to the authoritative three-ready snapshot",async()=>{
  const dom=installDom();let currentRevision=0,currentCount=0;let observed:ReturnType<typeof useHearthCanonicalThumbnailProjection>|null=null;
  const dependencies={readWorkspace:async()=>workspace(currentRevision),readAuthority:async()=>authority(currentRevision,currentCount)};
  function Harness(){observed=useHearthCanonicalThumbnailProjection({workspaceId,workpieceId,dependencies});return null;}
  const root=createRoot(dom.dom.window.document.getElementById("root")!);
  try{
    await act(async()=>{root.render(createElement(Harness));});
    assert.equal(observed!.canonical.candidateCount,0);
    currentRevision=1;currentCount=3;
    await act(async()=>{assert.deepEqual(await observed!.refreshCanonical(),{ok:true});});
    assert.equal(observed!.canonical.candidateSetRevision,1);
    assert.equal(observed!.canonical.candidateCount,3);
    assert.equal(observed!.canonical.eligibleCandidateCount,3);
    assert.deepEqual(observed!.canonical.previewAssetPaths,["thumbnails/1-0.png","thumbnails/1-1.png","thumbnails/1-2.png"]);
  }finally{await act(async()=>root.unmount());dom.restore();}
});

test("a superseded thumbnail refresh cannot roll the parent projection backward",async()=>{
  const dom=installDom();let deferred=false;const workResolvers:Array<(value:never)=>void>=[],authorityResolvers:Array<(value:never)=>void>=[];let observed:ReturnType<typeof useHearthCanonicalThumbnailProjection>|null=null;
  const dependencies={
    readWorkspace:async()=>deferred?await new Promise<never>((resolve)=>workResolvers.push(resolve)):workspace(0),
    readAuthority:async()=>deferred?await new Promise<never>((resolve)=>authorityResolvers.push(resolve)):authority(0,0),
  };
  function Harness(){observed=useHearthCanonicalThumbnailProjection({workspaceId,workpieceId,dependencies});return null;}
  const root=createRoot(dom.dom.window.document.getElementById("root")!);
  try{
    await act(async()=>{root.render(createElement(Harness));});deferred=true;
    let older!:ReturnType<NonNullable<typeof observed>["refreshCanonical"]>,newer!:ReturnType<NonNullable<typeof observed>["refreshCanonical"]>;
    act(()=>{older=observed!.refreshCanonical();newer=observed!.refreshCanonical();});
    await act(async()=>{workResolvers[1]!(workspace(2));authorityResolvers[1]!(authority(2,3));await newer;});
    assert.equal(observed!.canonical.candidateSetRevision,2);
    await act(async()=>{workResolvers[0]!(workspace(1));authorityResolvers[0]!(authority(1,3));await older;});
    assert.equal(observed!.canonical.candidateSetRevision,2);
    assert.deepEqual(observed!.canonical.previewAssetPaths,["thumbnails/2-0.png","thumbnails/2-1.png","thumbnails/2-2.png"]);
  }finally{await act(async()=>root.unmount());dom.restore();}
});
