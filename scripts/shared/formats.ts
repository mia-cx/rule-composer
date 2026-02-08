import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import matter from "gray-matter";
import type { ToolId, ToolConfig, RuleFile, SourceId } from "./types.js";
import { TOOL_IDS } from "./types.js";
import { ruleFrontmatterSchema } from "./schemas.js";

// Quote unquoted `globs` values in YAML frontmatter before parsing.
// Glob patterns starting with `*` are valid glob syntax but invalid YAML
// (`*` is the YAML alias character). Wrapping in quotes lets gray-matter
// parse the frontmatter without errors.
export const quoteGlobs = (raw: string): string =>
	raw.replace(/^(globs:\s*)([^"'\n][^\n]*)/m, (_, prefix: string, value: string) =>
		value.trim().includes("*") ? `${prefix}"${value.trim()}"` : `${prefix}${value}`,
	);

// Reverse of quoteGlobs — strip quotes from the `globs:` line after
// matter.stringify() so Cursor sees native unquoted glob values.
export const unquoteGlobs = (raw: string): string =>
	raw.replace(
		/^(globs:\s*)(['"])(.*)\2\s*$/m,
		(_, prefix: string, _quote: string, value: string) => `${prefix}${value}`,
	);

/** Tool registry — config for all supported tools */
export const TOOL_REGISTRY: Record<ToolId, ToolConfig> = {
	cursor: {
		id: "cursor",
		name: "Cursor",
		directories: [".cursor/rules/"],
		singleFiles: [".cursorrules"],
		extension: ".mdc",
		hasFrontmatter: true,
	},
	claude: {
		id: "claude",
		name: "Claude Code",
		directories: [".claude/rules/"],
		singleFiles: ["CLAUDE.md"],
		extension: ".md",
		hasFrontmatter: false,
	},
	copilot: {
		id: "copilot",
		name: "GitHub Copilot",
		directories: [".github/instructions/"],
		singleFiles: [".github/copilot-instructions.md"],
		extension: ".instructions.md",
		hasFrontmatter: false,
	},
	windsurf: {
		id: "windsurf",
		name: "Windsurf",
		directories: [".windsurf/"],
		singleFiles: [".windsurfrules"],
		extension: ".md",
		hasFrontmatter: false,
	},
	cline: {
		id: "cline",
		name: "Cline",
		directories: [".clinerules/"],
		singleFiles: [],
		extension: ".md",
		hasFrontmatter: false,
	},
	zed: {
		id: "zed",
		name: "Zed",
		directories: [],
		singleFiles: [".rules"],
		extension: "",
		hasFrontmatter: false,
	},
	"jetbrains-ai": {
		id: "jetbrains-ai",
		name: "JetBrains",
		directories: [".aiassistant/rules/"],
		singleFiles: [".junie/guidelines.md"],
		extension: ".md",
		hasFrontmatter: false,
	},
	amazonq: {
		id: "amazonq",
		name: "Amazon Q",
		directories: [".amazonq/rules/"],
		singleFiles: [],
		extension: ".md",
		hasFrontmatter: false,
	},
	gemini: {
		id: "gemini",
		name: "Gemini Code Assist",
		directories: [".gemini/"],
		singleFiles: ["GEMINI.md"],
		extension: ".md",
		hasFrontmatter: false,
	},
	aider: {
		id: "aider",
		name: "Aider",
		directories: [],
		singleFiles: ["CONVENTIONS.md"],
		extension: "",
		hasFrontmatter: false,
	},
};

/** Variable maps for placeholder resolution per tool */
export const TOOL_VARIABLES: Record<ToolId, Record<string, string>> = {
	cursor: {
		TOOL_NAME: "Cursor",
		RULES_DIR: ".cursor/rules/",
		RULES_EXT: ".mdc",
		SKILLS_DIR: ".cursor/skills/",
		SKILLS_EXT: "SKILL.md",
		GLOBAL_RULES: "~/.cursor/rules/",
		GLOBAL_SKILLS: "~/.cursor/skills/",
		RULE_EXAMPLE: ".cursor/rules/my-convention.mdc",
	},
	claude: {
		TOOL_NAME: "Claude Code",
		RULES_DIR: ".claude/rules/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "~/.claude/rules/",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".claude/rules/my-convention.md",
	},
	copilot: {
		TOOL_NAME: "GitHub Copilot",
		RULES_DIR: ".github/instructions/",
		RULES_EXT: ".instructions.md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".github/instructions/my-convention.instructions.md",
	},
	windsurf: {
		TOOL_NAME: "Windsurf",
		RULES_DIR: ".windsurf/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".windsurf/my-convention.md",
	},
	cline: {
		TOOL_NAME: "Cline",
		RULES_DIR: ".clinerules/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "Documents/Cline/",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".clinerules/my-convention.md",
	},
	zed: {
		TOOL_NAME: "Zed",
		RULES_DIR: "",
		RULES_EXT: "",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".rules",
	},
	"jetbrains-ai": {
		TOOL_NAME: "JetBrains",
		RULES_DIR: ".aiassistant/rules/",
		RULES_EXT: ".md",
		SKILLS_DIR: ".junie/",
		SKILLS_EXT: ".md",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".aiassistant/rules/my-convention.md",
	},
	amazonq: {
		TOOL_NAME: "Amazon Q",
		RULES_DIR: ".amazonq/rules/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".amazonq/rules/my-convention.md",
	},
	gemini: {
		TOOL_NAME: "Gemini Code Assist",
		RULES_DIR: ".gemini/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: ".gemini/my-convention.md",
	},
	aider: {
		TOOL_NAME: "Aider",
		RULES_DIR: "",
		RULES_EXT: "",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		RULE_EXAMPLE: "CONVENTIONS.md",
	},
};

/**
 * Detect which tool a document was likely written for,
 * based on tool-specific values (paths, extensions, names) found in the content.
 * Returns the best-matching tool ID or null if no strong signal.
 */
export const detectSourceTool = (content: string): ToolId | null => {
	let bestTool: ToolId | null = null;
	let bestScore = 0;

	const SIGNAL_KEYS = ["RULES_DIR", "SKILLS_DIR", "GLOBAL_RULES", "GLOBAL_SKILLS", "RULE_EXAMPLE"] as const;

	for (const toolId of TOOL_IDS) {
		const vars = TOOL_VARIABLES[toolId];
		if (!vars) continue;

		let score = 0;
		for (const key of SIGNAL_KEYS) {
			const value = vars[key];
			if (value && value.length >= 4 && content.includes(value)) {
				score += value.length;
			}
		}

		if (score > bestScore) {
			bestScore = score;
			bestTool = toolId;
		}
	}

	return bestTool;
};

/** Individual replacement entry for reporting to the user */
export interface PlaceholderReplacement {
	variable: string;
	value: string;
	count: number;
}

/**
 * Replace tool-specific values in content with {{PLACEHOLDER}} syntax.
 * Replaces longest values first to avoid partial matches.
 * Skips values shorter than 4 characters to avoid false positives (e.g. ".md").
 */
export const replaceWithPlaceholders = (
	content: string,
	toolId: ToolId,
): { content: string; replacements: PlaceholderReplacement[] } => {
	const vars = TOOL_VARIABLES[toolId];
	if (!vars) return { content, replacements: [] };

	// Build replacement pairs, sorted by value length (longest first)
	const pairs = Object.entries(vars)
		.filter(([, value]) => value.length >= 4)
		.sort(([, a], [, b]) => b.length - a.length);

	const replacements: PlaceholderReplacement[] = [];
	let result = content;

	for (const [key, value] of pairs) {
		const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(escaped, "g");
		const matches = result.match(regex);

		if (matches && matches.length > 0) {
			replacements.push({ variable: key, value, count: matches.length });
			result = result.replace(regex, `{{${key}}}`);
		}
	}

	return { content: result, replacements };
};

/**
 * Replace {{PLACEHOLDER}} with tool-specific values.
 * Lines containing a placeholder that resolves to empty string are removed entirely.
 */
export const resolvePlaceholders = (content: string, toolId: ToolId): string => {
	const vars = TOOL_VARIABLES[toolId];
	if (!vars) return content;

	const lines = content.split("\n");
	const resolved: string[] = [];

	for (const line of lines) {
		let result = line;
		let hasEmptyVar = false;

		result = result.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
			const value = vars[key];
			if (value === undefined) return `{{${key}}}`;
			if (value === "") {
				hasEmptyVar = true;
				return "";
			}
			return value;
		});

		if (!hasEmptyVar) {
			resolved.push(result);
		}
	}

	return resolved.join("\n");
};

/**
 * Extract a > [!globs] callout from content (reverse of injectGlobAnnotation).
 * Returns the cleaned content plus extracted glob metadata.
 */
export const extractGlobAnnotation = (content: string): { content: string; globs?: string; alwaysApply: boolean } => {
	const match = content.match(/^> \[!globs\](?: (.+))?$/m);
	if (!match) return { content, alwaysApply: true };

	const globs = match[1]?.trim() || undefined;
	// Remove the annotation line and collapse surrounding blank lines
	const cleaned = content
		.replace(/\n?\n?^> \[!globs\].*$/m, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return { content: cleaned, globs, alwaysApply: false };
};

/** Parse any tool's rule file into a RuleFile */
export const readRule = async (
	filePath: string,
	source: SourceId,
	type: "rule" | "skill" = "rule",
): Promise<RuleFile> => {
	const rawContent = await readFile(filePath, "utf-8");
	const ext = extname(filePath);
	const name = basename(filePath, ext).replace(/\.instructions$/, "");

	let body: string;
	let description = "";
	let globs: string | undefined;
	let alwaysApply: boolean | undefined;

	if (ext === ".mdc") {
		const parsed = matter(quoteGlobs(rawContent));
		body = parsed.content.trim();
		const fm = ruleFrontmatterSchema.safeParse(parsed.data);
		if (fm.success) {
			if (fm.data.description) description = fm.data.description;
			if (fm.data.globs) {
				globs = Array.isArray(fm.data.globs) ? fm.data.globs.join(", ") : fm.data.globs;
			}
			if (fm.data.alwaysApply !== undefined) alwaysApply = fm.data.alwaysApply;
		}
	} else {
		body = rawContent.trim();
		// Try to extract description from first paragraph
		const firstLine = body.split("\n").find((l) => l.trim() && !l.startsWith("#"));
		if (firstLine) {
			description = firstLine.trim().slice(0, 120);
		}
	}

	const hasPlaceholders = /\{\{\w+\}\}/.test(body);

	return {
		path: filePath,
		name,
		description,
		body,
		rawContent,
		source,
		type,
		hasPlaceholders,
		globs,
		alwaysApply,
	};
};

/**
 * Format markdown content using Prettier.
 * Resolves config from the filepath (walks up to find .prettierrc).
 * Degrades gracefully if Prettier is unavailable.
 */
export const formatMarkdown = async (content: string, filepath?: string): Promise<string> => {
	try {
		const prettier = await import("prettier");
		const config = filepath ? await prettier.resolveConfig(filepath) : {};
		return prettier.format(content, {
			...config,
			parser: "markdown",
			filepath,
		});
	} catch {
		return content;
	}
};

/** Write rules as a single composed markdown file */
export const writeAsSingleFile = async (content: string, filePath: string): Promise<void> => {
	await writeFile(filePath, content, "utf-8");
};

/** Options for writeAsDirectory behavior */
export interface WriteDirectoryOptions {
	/** Prefix filenames with zero-padded index (e.g. 01-name.ext) */
	numbered?: boolean;
}

/** Write rules as individual files in a tool's format */
export const writeAsDirectory = async (
	rules: RuleFile[],
	dir: string,
	toolId: ToolId,
	options?: WriteDirectoryOptions,
): Promise<void> => {
	const config = TOOL_REGISTRY[toolId];
	if (!config) return;

	await mkdir(dir, { recursive: true });

	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i]!;
		const ext = config.extension || ".md";
		const prefix = options?.numbered ? `${String(i + 1).padStart(2, "0")}-` : "";
		const fileName = `${prefix}${rule.name}${ext}`;
		const targetDir = rule.directory ? join(dir, rule.directory) : dir;

		await mkdir(targetDir, { recursive: true });
		const filePath = join(targetDir, fileName);

		let content: string;
		if (config.hasFrontmatter) {
			// Reconstruct with frontmatter, then unquote globs for Cursor
			const parsed = matter(quoteGlobs(rule.rawContent));
			content = unquoteGlobs(matter.stringify(rule.body, parsed.data));
		} else {
			content = rule.body;
		}

		await writeFile(filePath, content, "utf-8");
	}
};
