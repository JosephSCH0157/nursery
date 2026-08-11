import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/lib/tongs-fetch.ts",import.meta.url),"utf8");

test("active Supabase session precedes compatibility Tongs storage",()=>{
 const resolver=source.match(/export async function resolveTongsUserAccessToken[\s\S]*?\n}/)?.[0]??"";
 assert.ok(resolver.indexOf("auth.getSession()")>=0);
 assert.ok(resolver.indexOf("resolveUserAccessTokenFromStorage()")>resolver.indexOf("auth.getSession()"));
 assert.match(resolver,/refreshSession/);
});
