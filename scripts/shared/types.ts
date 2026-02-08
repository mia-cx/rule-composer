/** All supported AI coding tools */
export const TOOL_IDS = [
	"cursor",
	"claude",
	"copilot",
	"windsurf",
	"cline",
	"zed",
	"jetbrains-ai",
	"amazonq",
	"gemini",
	"aider",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** Special source identifier for the agents repo itself */
export type SourceId = ToolId | "agents-repo";

/** Configuration for a supported tool */
export interface ToolConfig {
	id: ToolId;
	name: string;
	/** Directories where the tool stores rules (relative to project root) */
	directories: string[];
	/** Single files the tool uses for rules */
	singleFiles: string[];
	/** File extension for rule files */
	extension: string;
	/** Whether the tool uses YAML frontmatter */
	hasFrontmatter: boolean;
}

/** A discovered rule file */
export interface RuleFile {
	/** Absolute path to the file */
	path: string;
	/** File name without extension */
	name: string;
	/** Description from frontmatter or first paragraph */
	description: string;
	/** Markdown body (without frontmatter) */
	body: string;
	/** Raw file content (with frontmatter) */
	rawContent: string;
	/** Which source this was discovered from */
	source: SourceId;
	/** Whether the file is a rule or skill */
	type: "rule" | "skill";
	/** Whether the file contains {{placeholders}} */
	hasPlaceholders: boolean;
	/** Optional subdirectory for grouping (used by decompose) */
	directory?: string;
	/** Glob patterns from frontmatter (comma-separated string) */
	globs?: string;
	/** Whether the rule applies globally (true) or is scoped (false) */
	alwaysApply?: boolean;
}

/** Output target for writing composed rules */
export type OutputTarget = { kind: "single-file"; path: string } | { kind: "directory"; dir: string; tool: ToolId };

/** Discovered source with its rules */
export interface DiscoveredSource {
	id: SourceId;
	label: string;
	rules: RuleFile[];
}

/** Tree node for the interactive tree multiselect */
export interface TreeNode {
	id: string;
	label: string;
	hint?: string;
	isDirectory: boolean;
	expanded: boolean;
	selected: boolean;
	children?: TreeNode[];
	ruleFile?: RuleFile;
}
