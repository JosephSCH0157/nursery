import js from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  { ignores: ["dist", "node_modules", "src/db.types.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      globals: {
        Blob: "readonly",
        Buffer: "readonly",
        FormData: "readonly",
        Response: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        console: "readonly",
        process: "readonly",
        structuredClone: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: false,
        projectService: false,
      },
    },
  },
];
