#!/usr/bin/env node
import childProcess from "node:child_process";
import { createRequire } from "node:module";
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

const require = createRequire(import.meta.url);
const viteCliPath = require.resolve("vite/bin/vite.js");
await import(pathToFileURL(viteCliPath).href);
