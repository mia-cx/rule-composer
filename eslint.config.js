import { defineConfig } from "eslint/config";
import markdown from "@eslint/markdown";
import tseslint from "typescript-eslint";

export default defineConfig([
	{
		ignores: [
			"node_modules/",
			"dist/",
			"**/node_modules/",
			"**/dist/",
			"apps/docs/",
			".cursor/",
			"**/coding-tools.bak/",
			"**/rules.bak/",
			"online-examples/",
			"**/__tests__/fixtures/",
			"*.plan.md",
		],
	},
	{
		files: ["**/*.md", "**/*.mdc"],
		plugins: { markdown },
		language: "markdown/commonmark",
		extends: ["markdown/recommended"],
		rules: {
			// Callouts (e.g. [!NOTE]) and task lists ([ ], [x]) are not link refs
			"markdown/no-missing-label-refs": "off",
			// Spaces inside emphasis markers; callouts like > [!globs] trigger false positives
			"markdown/no-space-in-emphasis": "off",
		},
	},
	...tseslint.configs.recommended.map((config) => ({
		...config,
		files: ["scripts/**/*.ts"],
		languageOptions: {
			...config.languageOptions,
			parserOptions: {
				...config.languageOptions?.parserOptions,
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		rules: {
			...config.rules,
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
		},
	})),
]);
