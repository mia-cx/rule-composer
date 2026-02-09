import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname, extname } from "node:path";
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

/**
 * Ensure exactly one blank line between YAML frontmatter (closing ---) and body.
 * gray-matter stringify does not add this; markdown convention and @eslint/markdown expect it.
 */
export const ensureBlankLineAfterFrontmatter = (raw: string): string =>
	raw.replace(/(---\r?\n(?:.*\r?\n)*?---\r?\n)([^\r\n])/m, "$1\n$2");

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
		AGENTS_DIR: ".cursor/agents/",
		COMMANDS_DIR: ".cursor/commands/",
		GLOBAL_RULES: "~/.cursor/rules/",
		GLOBAL_SKILLS: "~/.cursor/skills/",
		GLOBAL_AGENTS: "~/.cursor/agents/",
		GLOBAL_COMMANDS: "~/.cursor/commands/",
		RULE_EXAMPLE: ".cursor/rules/my-convention.mdc",
	},
	claude: {
		TOOL_NAME: "Claude Code",
		RULES_DIR: ".claude/rules/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "~/.claude/rules/",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".claude/rules/my-convention.md",
	},
	copilot: {
		TOOL_NAME: "GitHub Copilot",
		RULES_DIR: ".github/instructions/",
		RULES_EXT: ".instructions.md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".github/instructions/my-convention.instructions.md",
	},
	windsurf: {
		TOOL_NAME: "Windsurf",
		RULES_DIR: ".windsurf/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".windsurf/my-convention.md",
	},
	cline: {
		TOOL_NAME: "Cline",
		RULES_DIR: ".clinerules/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "Documents/Cline/",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".clinerules/my-convention.md",
	},
	zed: {
		TOOL_NAME: "Zed",
		RULES_DIR: "",
		RULES_EXT: "",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".rules",
	},
	"jetbrains-ai": {
		TOOL_NAME: "JetBrains",
		RULES_DIR: ".aiassistant/rules/",
		RULES_EXT: ".md",
		SKILLS_DIR: ".junie/",
		SKILLS_EXT: ".md",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".aiassistant/rules/my-convention.md",
	},
	amazonq: {
		TOOL_NAME: "Amazon Q",
		RULES_DIR: ".amazonq/rules/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".amazonq/rules/my-convention.md",
	},
	gemini: {
		TOOL_NAME: "Gemini Code Assist",
		RULES_DIR: ".gemini/",
		RULES_EXT: ".md",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
		RULE_EXAMPLE: ".gemini/my-convention.md",
	},
	aider: {
		TOOL_NAME: "Aider",
		RULES_DIR: "",
		RULES_EXT: "",
		SKILLS_DIR: "",
		SKILLS_EXT: "",
		AGENTS_DIR: "",
		COMMANDS_DIR: "",
		GLOBAL_RULES: "",
		GLOBAL_SKILLS: "",
		GLOBAL_AGENTS: "",
		GLOBAL_COMMANDS: "",
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

	const SIGNAL_KEYS = [
		"RULES_DIR",
		"SKILLS_DIR",
		"AGENTS_DIR",
		"COMMANDS_DIR",
		"GLOBAL_RULES",
		"GLOBAL_SKILLS",
		"GLOBAL_AGENTS",
		"GLOBAL_COMMANDS",
		"RULE_EXAMPLE",
	] as const;

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

const RE_GLOBS = /^> \[!globs\](?: (.+))?$/;
const RE_ALWAYS_APPLY = /^> \[!alwaysApply]\s*(true|false)$/i;
/** Matches > [!type] skill|agent|command so decomposed sections restore to the right dirs */
const RE_TYPE = /^> \[!type]\s+(skill|agent|command)$/i;
const RE_PLAIN_BLOCKQUOTE = /^> ?(.*)$/;

/**
 * Extract inline section metadata from the start of content: plain blockquote (description),
 * > [!globs], > [!alwaysApply], and > [!type] skill|agent|command. Strips all consumed lines
 * and returns cleaned content. Used when decomposing a monolith so frontmatter and section
 * type (for skills/agents/commands dirs) are reliable.
 */
export const extractSectionMetadata = (
	content: string,
): {
	content: string;
	description?: string;
	globs?: string;
	alwaysApply: boolean;
	/** When present, section should be written to skills/agents/commands (from composed callout). */
	type?: "skill" | "agent" | "command";
} => {
	const lines = content.split("\n");
	const startIdx = lines[0]?.trim().match(/^## /) ? 1 : 0;

	const descriptionParts: string[] = [];
	let globs: string | undefined;
	let alwaysApply = true;
	let sectionType: "skill" | "agent" | "command" | undefined;
	let bodyStart = startIdx;

	for (let i = startIdx; i < lines.length; i++) {
		const line = lines[i]!;
		const trimmed = line.trim();
		if (!trimmed) {
			// Skip blank lines; they don't end the metadata block
			continue;
		}
		const globsMatch = trimmed.match(RE_GLOBS);
		if (globsMatch) {
			globs = globsMatch[1]?.trim() || undefined;
			alwaysApply = false;
			bodyStart = i + 1;
			continue;
		}
		const alwaysMatch = trimmed.match(RE_ALWAYS_APPLY);
		if (alwaysMatch) {
			alwaysApply = alwaysMatch[1]!.toLowerCase() === "true";
			bodyStart = i + 1;
			continue;
		}
		const typeMatch = trimmed.match(RE_TYPE);
		if (typeMatch) {
			sectionType = typeMatch[1]!.toLowerCase() as "skill" | "agent" | "command";
			bodyStart = i + 1;
			continue;
		}
		const quoteMatch = trimmed.match(RE_PLAIN_BLOCKQUOTE);
		if (quoteMatch) {
			descriptionParts.push(quoteMatch[1]!.trim());
			bodyStart = i + 1;
			continue;
		}
		// First non-metadata line
		bodyStart = i;
		break;
	}

	const description = descriptionParts.length > 0 ? descriptionParts.join(" ").trim().slice(0, 120) : undefined;

	const prefix = startIdx > 0 ? lines.slice(0, startIdx).join("\n") : "";
	const body = lines.slice(bodyStart).join("\n");
	const cleaned = (prefix ? `${prefix}\n\n${body}` : body).replace(/\n{3,}/g, "\n\n").trim();

	return { content: cleaned, description, globs, alwaysApply, type: sectionType };
};

/** Infer rule/skill/agent/command from file path (e.g. .../agents/foo.md → "agent"). */
export const inferRuleTypeFromPath = (filePath: string): "rule" | "skill" | "agent" | "command" => {
	const normalized = filePath.replace(/\\/g, "/");
	const base = normalized.split("/").pop() ?? "";
	if ((normalized.includes("/skills/") || normalized.startsWith("skills/")) && base === "SKILL.md") return "skill";
	if (normalized.includes("/agents/") || normalized.startsWith("agents/")) return "agent";
	if (normalized.includes("/commands/") || normalized.startsWith("commands/")) return "command";
	return "rule";
};

/** Parse any tool's rule file into a RuleFile */
export const readRule = async (
	filePath: string,
	source: SourceId,
	type: "rule" | "skill" | "agent" | "command" = "rule",
): Promise<RuleFile> => {
	const rawContent = await readFile(filePath, "utf-8");
	const ext = extname(filePath);
	const fileBaseName = basename(filePath, ext).replace(/\.instructions$/, "");
	// Skills are identified by their parent directory (e.g. skills/organize-commits/SKILL.md → "organize-commits"), not the filename "SKILL"
	const name = type === "skill" ? basename(dirname(filePath)) : fileBaseName;

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

/**
 * Derive layout root and rules dir from the chosen output directory.
 * When dir is a "rules" dir (e.g. .cursor/rules/), layout root is its parent; else dir is the root.
 */
export const getLayoutRootAndRulesDir = (dir: string): { layoutRoot: string; rulesDir: string } => {
	const normalized = dir.replace(/\/+$/, "");
	if (normalized.endsWith("/rules") || normalized.endsWith("rules")) {
		return { layoutRoot: dirname(normalized), rulesDir: normalized };
	}
	return { layoutRoot: normalized, rulesDir: join(normalized, "rules") };
};

/** Path where writeAsDirectory would write this rule (for overwrite checks). */
export const getOutputFilePathForRule = (
	rule: RuleFile,
	dir: string,
	toolId: ToolId,
	opts?: { numbered?: boolean; ruleIndex?: number },
): string => {
	const config = TOOL_REGISTRY[toolId];
	if (!config) return join(dir, `${rule.name}.md`);
	const { layoutRoot, rulesDir } = getLayoutRootAndRulesDir(dir);
	const ext = config.extension || ".md";
	if (rule.type === "skill") return join(layoutRoot, "skills", rule.name, "SKILL.md");
	if (rule.type === "agent") return join(layoutRoot, "agents", `${rule.name}.md`);
	if (rule.type === "command") return join(layoutRoot, "commands", `${rule.name}.md`);
	const prefix = opts?.numbered && opts.ruleIndex != null ? `${String(opts.ruleIndex).padStart(2, "0")}-` : "";
	const targetDir = rule.directory ? join(rulesDir, rule.directory) : rulesDir;
	return join(targetDir, `${prefix}${rule.name}${ext}`);
};

/** Write rules/skills/agents/commands to canonical layout: rules in rulesDir, skills in layoutRoot/skills/<name>/SKILL.md, agents/commands in layoutRoot/agents|commands/<name>.md */
export const writeAsDirectory = async (
	rules: RuleFile[],
	dir: string,
	toolId: ToolId,
	options?: WriteDirectoryOptions,
): Promise<void> => {
	const config = TOOL_REGISTRY[toolId];
	if (!config) return;

	const { layoutRoot, rulesDir } = getLayoutRootAndRulesDir(dir);
	await mkdir(rulesDir, { recursive: true });

	let ruleIndex = 0;
	for (const rule of rules) {
		let filePath: string;
		let content: string;

		if (config.hasFrontmatter) {
			const parsed = matter(quoteGlobs(rule.rawContent));
			content = ensureBlankLineAfterFrontmatter(unquoteGlobs(matter.stringify(rule.body, parsed.data)));
		} else {
			content = rule.body;
		}

		if (rule.type === "skill") {
			filePath = join(layoutRoot, "skills", rule.name, "SKILL.md");
			await mkdir(dirname(filePath), { recursive: true });
		} else if (rule.type === "agent") {
			filePath = join(layoutRoot, "agents", `${rule.name}.md`);
			await mkdir(dirname(filePath), { recursive: true });
		} else if (rule.type === "command") {
			filePath = join(layoutRoot, "commands", `${rule.name}.md`);
			await mkdir(dirname(filePath), { recursive: true });
		} else {
			ruleIndex += 1;
			const ext = config.extension || ".md";
			const prefix = options?.numbered ? `${String(ruleIndex).padStart(2, "0")}-` : "";
			const fileName = `${prefix}${rule.name}${ext}`;
			const targetDir = rule.directory ? join(rulesDir, rule.directory) : rulesDir;
			await mkdir(targetDir, { recursive: true });
			filePath = join(targetDir, fileName);
		}

		await writeFile(filePath, content, "utf-8");
	}
};
