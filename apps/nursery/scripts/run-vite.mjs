#!/usr/bin/env node
import childProcess from "node:child_process";
import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const originalExec = childProcess.exec.bind(childProcess);

childProcess.exec = function patchedExec(command, ...rest) {
  if (typeof command === "string" && command.trim().toLowerCase() === "net use") {
    const callback = rest.find((arg) => typeof arg === "function");
    if (typeof callback === "function") {
      queueMicrotask(() => {
        callback(Object.assign(new Error("net use disabled for vite startup"), { code: "EPERM" }), "", "");
      });
    }
    return { pid: 0, kill: () => false, on: () => undefined };
  }
  return originalExec(command, ...rest);
};

// Vite imports `exec` from the ESM builtin entrypoint, so keep Node's
// CommonJS/ESM builtin exports in sync before loading Vite.
syncBuiltinESMExports();

const require = createRequire(import.meta.url);
const vitePackageJsonPath = require.resolve("vite/package.json");
const viteNodeModulesDir = path.resolve(path.dirname(vitePackageJsonPath), "..");
const esbuildPackageJsonPath = path.join(viteNodeModulesDir, "esbuild", "package.json");
const esbuildRequire = createRequire(esbuildPackageJsonPath);
const esbuildBinPath = esbuildRequire.resolve("@esbuild/win32-x64/esbuild.exe");
process.env.ESBUILD_BINARY_PATH = esbuildBinPath;

const viteCliPath = path.join(path.dirname(vitePackageJsonPath), "bin", "vite.js");
await import(pathToFileURL(viteCliPath).href);
