export type YouTubeReferenceMetadata={videoId:string;canonicalUrl:string;embedUrl:string;title:string;authorName:string;authorUrl:string|null;thumbnailUrl:string|null;providerName:"YouTube"};

export function normalizeYouTubeUrl(value:string):{videoId:string;canonicalUrl:string;embedUrl:string}{
 const url=new URL(value.trim()),host=url.hostname.toLowerCase().replace(/^www\./,"");let videoId:string|null=null;
 if(host==="youtu.be")videoId=url.pathname.split("/").filter(Boolean)[0]??null;
 else if(host==="youtube.com"||host==="m.youtube.com"||host==="music.youtube.com"||host==="youtube-nocookie.com"){
  if(url.pathname==="/watch")videoId=url.searchParams.get("v");
  else{const match=url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/);videoId=match?.[1]??null;}
 }
 if(!videoId||!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw new Error("youtube_url_invalid");
 return{videoId,canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`,embedUrl:`https://www.youtube-nocookie.com/embed/${videoId}`};
}

export async function inspectYouTubeReference(value:string,fetchImpl:typeof fetch=fetch):Promise<YouTubeReferenceMetadata>{
 const normalized=normalizeYouTubeUrl(value),endpoint=`https://www.youtube.com/oembed?url=${encodeURIComponent(normalized.canonicalUrl)}&format=json`,response=await fetchImpl(endpoint,{headers:{accept:"application/json"},signal:AbortSignal.timeout(15_000)});
 if(!response.ok)throw new Error(`youtube_metadata_failed:${response.status}`);const body=await response.json() as Record<string,unknown>,title=typeof body.title==="string"?body.title.trim():"",authorName=typeof body.author_name==="string"?body.author_name.trim():"";
 if(!title||!authorName)throw new Error("youtube_metadata_invalid");return{...normalized,title,authorName,authorUrl:typeof body.author_url==="string"?body.author_url:null,thumbnailUrl:typeof body.thumbnail_url==="string"?body.thumbnail_url:null,providerName:"YouTube"};
}
