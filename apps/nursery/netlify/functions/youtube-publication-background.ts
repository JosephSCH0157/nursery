import type { Config } from "@netlify/functions";
import { YoutubePublicationWorker } from "../../server/publishing/youtube-publication-worker";

function required(name:string):string{const value=Netlify.env.get(name)?.trim();if(!value)throw new Error(`Missing ${name}`);return value}
export default async function():Promise<void>{const worker=new YoutubePublicationWorker({supabaseUrl:required("TONGS_SUPABASE_URL"),serviceRoleKey:required("TONGS_SERVICE_ROLE_KEY"),googleClientId:required("FORGE_GOOGLE_OAUTH_CLIENT_ID"),googleClientSecret:required("FORGE_GOOGLE_OAUTH_CLIENT_SECRET")});const deadline=Date.now()+12*60*1000;while(Date.now()<deadline){const result=await worker.runOne();if(!result.worked)break}}
export const config:Config={};
