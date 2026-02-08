/** @type {import("prettier").Config} */
export default {
	printWidth: 120,
	quoteProps: "as-needed",
	trailingComma: "all",
	tabWidth: 4,
	useTabs: true,
	singleQuote: false,
	semi: true,
	overrides: [
		{
			files: ["*.json", "*.jsonc", "*.json5"],
			options: { tabWidth: 2, useTabs: false },
		},
		{
			files: ["*.md", "*.mdc"],
			options: { tabWidth: 2, useTabs: false, parser: "markdown" },
		},
	],
};
