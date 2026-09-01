import assert from "node:assert/strict";
import test from "node:test";
import { selectSupabaseConfigAuthority } from "../src/lib/hearth-style-service";

test("embedded Hearth prefers Nursery runtime authority over conflicting compile-time configuration", () => {
  const selected = selectSupabaseConfigAuthority({
    runtimeClient: { url: "http://127.0.0.1:54321", anonKey: "runtime-key" },
    compileTime: { url: "https://project-b.supabase.co", anonKey: "compile-key" },
  });
  assert.deepEqual(selected, { url: "http://127.0.0.1:54321", anonKey: "runtime-key" });
});

test("standalone Hearth falls back to complete compile-time authority", () => {
  const selected = selectSupabaseConfigAuthority({
    runtimeClient: null,
    runtimeGlobal: null,
    compileTime: { url: "https://standalone.supabase.co", anonKey: "standalone-key" },
  });
  assert.deepEqual(selected, { url: "https://standalone.supabase.co", anonKey: "standalone-key" });
});

test("partial runtime authority never mixes credentials across projects", () => {
  const selected = selectSupabaseConfigAuthority({
    runtimeClient: { url: "http://127.0.0.1:54321" },
    compileTime: { url: "https://standalone.supabase.co", anonKey: "standalone-key" },
  });
  assert.deepEqual(selected, { url: "https://standalone.supabase.co", anonKey: "standalone-key" });
});
