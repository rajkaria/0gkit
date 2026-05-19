import tseslint from "typescript-eslint";

// Mirrors apps/web: Next 16 dropped `next lint`; run typescript-eslint's
// recommended set directly. Build + typecheck cover the heavier analysis.
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "out/**",
      "build/**",
      "playwright-report/**",
      "test-results/**",
      "**/*.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-debugger": "error",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
