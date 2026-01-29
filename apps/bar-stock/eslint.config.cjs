const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: { name: "eslint:recommended" }
});

module.exports = [
  {
    ignores: ["dist", "node_modules"],
  },
  ...compat.extends("eslint:recommended"),
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
