import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * Lint rules double as architecture enforcement (docs/ARCHITECTURE.md §4) and security controls
 * (docs/THREAT_MODEL.md T-21, T-22). Plugins are registered once by eslint-config-next; the blocks
 * below only add or tighten rules.
 */

const serverOnly = {
  group: ["@/server", "@/server/*", "drizzle-orm", "drizzle-orm/*", "pg", "pino"],
  message: "Client-safe code must not import server modules. Pass data in as props or call /api/v1.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".data/**",
    "db/migrations/**",
    "next-env.d.ts",
  ]),

  // Full jsx-a11y recommended set (Next enables only a handful). Target: WCAG 2.2 AA (PRD NFR-2).
  { files: ["**/*.{jsx,tsx}"], rules: jsxA11y.flatConfigs.recommended.rules },

  // Type-aware rules for async correctness, exhaustive state handling, and clean imports.
  {
    files: ["**/*.{ts,tsx,mts}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Security: no raw HTML injection, no unparameterized SQL, no stray console output.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "react/no-danger": "error",
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
          message: "sql.raw() bypasses parameterization (THREAT_MODEL T-22). Use the sql`` tagged template.",
        },
        {
          selector:
            "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/], TemplateElement[value.raw=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message: "Use a design token from globals.css instead of a raw hex color.",
        },
      ],
    },
  },

  // Layering rules (ARCHITECTURE §4).
  {
    files: ["src/server/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/server/*",
                "!@/server/domain",
                "!@/server/domain/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "pg",
              ],
              message: "Domain logic is pure: no database, framework, or service imports.",
            },
            {
              group: ["next", "next/*", "react", "react-dom", "@/app/*", "@/components/*"],
              message: "Domain logic is framework-free.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*", "drizzle-orm", "drizzle-orm/*", "pg"],
              message: "Routes and pages go through services, never the database directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/client/**/*.{ts,tsx}", "src/shared/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [serverOnly] }] },
  },

  // Tests and tooling may use console and test-only patterns.
  {
    files: ["tests/**/*.{ts,tsx}", "scripts/**/*.{js,mjs,ts}", "*.config.{ts,mts,mjs}"],
    rules: { "no-console": "off" },
  },
]);
