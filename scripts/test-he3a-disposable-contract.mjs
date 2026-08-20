import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./he3a-disposable-supabase.mjs", import.meta.url), "utf8");
assert.match(source, /allowedHostIps = new Set\(\["127\.0\.0\.1", "::1"\]\)/);
assert.match(source, /non-loopback Docker binding found/);
assert.match(source, /Get-NetTCPConnection -State Listen/);
assert.match(source, /LAN connectivity unexpectedly succeeded/);
assert.match(source, /existing nursery stack changed/);
assert.match(source, /com\.supabase\.cli\.project/);
assert.match(source, /forge\.he3a\.identity/);
assert.match(source, /a disposable container bypassed the HE-3A creation guard/);
assert.match(source, /--no-backup/);
assert.doesNotMatch(source, /0\.0\.0\.0.*allowedHostIps/);
process.stdout.write("HE-3A disposable-stack harness contract passed.\n");
