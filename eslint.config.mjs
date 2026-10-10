import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
    ],
  },

  // Next.js core-web-vitals rules (React, @next/next, jsx-a11y, import).
  {
    extends: [...next],
  },

  // TypeScript-aware rules.
  //
  // Before this, the flat config only carried the Next preset: 66 rules, none of
  // them TypeScript-aware. `no-unused-vars`, `no-explicit-any` and
  // `ban-ts-comment` were all absent, so `npm run lint` passed on code that
  // should never have passed. This is what makes lint mean something for
  // .ts/.tsx.
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // Resolves each file to its tsconfig without path mapping.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused code is a real defect, not a style opinion.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // `any` defeats the point of `strict: true`. If it is genuinely needed,
      // use a targeted disable with a written reason.
      "@typescript-eslint/no-explicit-any": "error",

      // No escape hatches without a written justification.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],

      // Unhandled promises are silent data-loss bugs.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],

      // Prefer accurate null checks over non-null assertions.
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // The `no-unsafe-*` family is disabled deliberately. This app parses
      // binary payloads and third-party JSON, so `any` genuinely flows in from
      // `DataView`/`JSON.parse` at legitimate boundaries. Flagging every such
      // boundary produced pure noise and trained us to ignore the output.
      // Typed at those boundaries by hand, via the interfaces in
      // src/types/auction.ts.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  // Config files are not part of the TS program; keep them out of typed linting.
  {
    files: ["*.config.mjs", "*.config.ts", "scripts/**"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
