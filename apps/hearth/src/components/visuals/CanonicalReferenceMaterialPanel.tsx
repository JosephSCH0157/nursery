import { useState } from "react";
import CanonicalReferenceClipPanel from "./CanonicalReferenceClipPanel";
import CanonicalReferenceVisualPanel from "./CanonicalReferenceVisualPanel";

export default function CanonicalReferenceMaterialPanel({workspaceId,workpieceId}:{workspaceId:string;workpieceId:string}){
 const[tab,setTab]=useState<"source_clips"|"reference_visuals">("source_clips");
 return <section className="hs-reference-material" aria-label="Reference Material"><header className="hs-reference-material-header"><div><h3>Reference Material</h3><p>Use real source footage or turn exact source evidence into a clear visual story.</p></div></header><div className="hs-reference-material-tabs" role="tablist" aria-label="Reference Material type"><button type="button" role="tab" aria-selected={tab==="source_clips"} className={tab==="source_clips"?"is-active":""} onClick={()=>setTab("source_clips")}>Source Clips</button><button type="button" role="tab" aria-selected={tab==="reference_visuals"} className={tab==="reference_visuals"?"is-active":""} onClick={()=>setTab("reference_visuals")}>Reference Visuals</button></div><div role="tabpanel">{tab==="source_clips"?<CanonicalReferenceClipPanel workspaceId={workspaceId} workpieceId={workpieceId}/>:<CanonicalReferenceVisualPanel workspaceId={workspaceId} workpieceId={workpieceId}/>}</div></section>;
}
