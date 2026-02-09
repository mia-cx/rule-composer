import { readdir, access, readFile } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_REGISTRY } from "./formats.js";
import { readRule } from "./formats.js";
import type { ToolId, DiscoveredSource, RuleFile, SourceId } from "./types.js";
import { TOOL_IDS } from "./types.js";

const RULE_EXTENSIONS = new Set([".mdc", ".md"]);
const SKILL_FILENAME = "SKILL.md";

/** Extract leading numeric prefix from rule name (e.g. "01-approach" → 1, "99-foo" → 99). No prefix → 0. */
const numericPrefix = (name: string): number => {
	const m = /^(\d+)-/.exec(name);
	return m ? parseInt(m[1]!, 10) : 0;
};

/** Sort rules by filename prefix (01-, 02-, …, 99-) so order is stable and 99-rule-name appears last. */
export const sortRulesByFilenamePrefix = (rules: RuleFile[]): RuleFile[] => {
	return [...rules].sort((a, b) => numericPrefix(a.name) - numericPrefix(b.name));
};

/** Check if a path exists */
const exists = async (path: string): Promise<boolean> => {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
};

/**
 * Recursively walk a directory, finding rule/skill files.
 * Skips directories starting with '_'.
 */
export const walkDir = async (dir: string, source: SourceId, type: "rule" | "skill"): Promise<RuleFile[]> => {
	const rules: RuleFile[] = [];

	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return rules;
	}

	for (const entry of entries) {
		// Skip _prefixed directories
		if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			// Check for SKILL.md inside subdirectories
			const skillPath = join(fullPath, SKILL_FILENAME);
			if (await exists(skillPath)) {
				rules.push(await readRule(skillPath, source, "skill"));
			}
			// Recurse into subdirectories
			const nested = await walkDir(fullPath, source, type);
			rules.push(...nested);
		} else if (entry.isFile()) {
			const ext = entry.name.endsWith(".mdc") ? ".mdc" : entry.name.endsWith(".md") ? ".md" : null;

			if (ext && RULE_EXTENSIONS.has(ext) && entry.name !== SKILL_FILENAME) {
				rules.push(await readRule(fullPath, source, type));
			}
		}
	}

	return sortRulesByFilenamePrefix(rules);
};

/** Walk a flat directory of .md files (e.g. agents/, commands/) and return as RuleFile[] with the given type. */
export const walkFlatMarkdownDir = async (
	dir: string,
	source: SourceId,
	type: "agent" | "command",
): Promise<RuleFile[]> => {
	const results: RuleFile[] = [];
	let entries: { name: string; isFile: () => boolean }[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const fullPath = join(dir, entry.name);
		results.push(await readRule(fullPath, source, type));
	}
	return sortRulesByFilenamePrefix(results);
};

/** Scan a directory for rules, skills, agents, and commands (canonical layout) and return as a DiscoveredSource */
export const scanDirectory = async (dir: string): Promise<DiscoveredSource> => {
	const all: RuleFile[] = [];
	if (await exists(join(dir, "rules"))) {
		all.push(...(await walkDir(join(dir, "rules"), "agents-repo", "rule")));
	}
	if (await exists(join(dir, "skills"))) {
		all.push(...(await walkDir(join(dir, "skills"), "agents-repo", "skill")));
	}
	if (await exists(join(dir, "agents"))) {
		all.push(...(await walkFlatMarkdownDir(join(dir, "agents"), "agents-repo", "agent")));
	}
	if (await exists(join(dir, "commands"))) {
		all.push(...(await walkFlatMarkdownDir(join(dir, "commands"), "agents-repo", "command")));
	}
	// If no canonical subdirs, treat dir as rules dir (single dir of rule files)
	if (all.length === 0) {
		const rules = await walkDir(dir, "agents-repo", "rule");
		return {
			id: "agents-repo",
			label: `${dir} (${rules.length} ${rules.length === 1 ? "file" : "files"})`,
			rules,
		};
	}
	return {
		id: "agents-repo",
		label: `${dir} (${all.length} files)`,
		rules: sortRulesByFilenamePrefix(all),
	};
};

/** Detect tool rule directories in a given CWD */
export const detectTools = async (cwd: string): Promise<DiscoveredSource[]> => {
	const sources: DiscoveredSource[] = [];

	for (const toolId of TOOL_IDS) {
		const config = TOOL_REGISTRY[toolId];
		if (!config) continue;

		const rules: RuleFile[] = [];

		// Check directories
		for (const dir of config.directories) {
			const dirPath = join(cwd, dir);
			if (await exists(dirPath)) {
				const found = await walkDir(dirPath, toolId, "rule");
				rules.push(...found);
			}
		}

		// Check single files
		for (const file of config.singleFiles) {
			const filePath = join(cwd, file);
			if (await exists(filePath)) {
				rules.push(await readRule(filePath, toolId, "rule"));
			}
		}

		if (rules.length > 0) {
			sources.push({
				id: toolId,
				label: `${config.name} (${rules.length} ${rules.length === 1 ? "file" : "files"})`,
				rules,
			});
		}
	}

	return sources;
};

/**
 * Project display name for the agents-repo source label.
 * Uses package.json "name" if present (strip @scope/), else basename of root path.
 */
export const getProjectDisplayName = async (rootPath: string): Promise<string> => {
	const pkgPath = join(rootPath, "package.json");
	try {
		const raw = await readFile(pkgPath, "utf-8");
		const pkg = JSON.parse(raw) as { name?: string };
		const name = pkg?.name;
		if (typeof name === "string" && name.length > 0) {
			// "@scope/package" -> "package"
			const lastSlash = name.lastIndexOf("/");
			return lastSlash >= 0 ? name.slice(lastSlash + 1) : name;
		}
	} catch {
		// no package.json or invalid JSON
	}
	const base = basename(rootPath);
	return base || "project";
};

/**
 * Resolve the agents repo for bundled rules.
 * Three-tier resolution:
 * 1. Local rules/ directory (if running from the agents repo)
 * 2. GitHub fetch (future — not implemented in MVP)
 * 3. Bundled rules (from the published package)
 * Labels use project name from package.json or root directory name, not "agents repo".
 */
export const resolveAgentsRepo = async (cwd: string): Promise<DiscoveredSource | null> => {
	const rules: RuleFile[] = [];

	// Tier 1: Local rules/, skills/, agents/, commands/ in CWD
	const localRulesDir = join(cwd, "rules");
	const localSkillsDir = join(cwd, "skills");
	const localAgentsDir = join(cwd, "agents");
	const localCommandsDir = join(cwd, "commands");

	if (await exists(localRulesDir)) {
		rules.push(...(await walkDir(localRulesDir, "agents-repo", "rule")));
	}
	if (await exists(localSkillsDir)) {
		rules.push(...(await walkDir(localSkillsDir, "agents-repo", "skill")));
	}
	if (await exists(localAgentsDir)) {
		rules.push(...(await walkFlatMarkdownDir(localAgentsDir, "agents-repo", "agent")));
	}
	if (await exists(localCommandsDir)) {
		rules.push(...(await walkFlatMarkdownDir(localCommandsDir, "agents-repo", "command")));
	}

	// If we found local rules, use them
	if (rules.length > 0) {
		const projectName = await getProjectDisplayName(cwd);
		return {
			id: "agents-repo",
			label: `${projectName} — local (${rules.length} files)`,
			rules,
		};
	}

	// Tier 3: Bundled rules (from the published package)
	return getBundledSource();
};

const PACKAGE_ROOT_CANDIDATES = ((): string[] => {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	// Published: dist/shared/scanner.js -> ../.. is package root
	// Dev: scripts/shared/scanner.ts -> ../.. is package root
	return [
		resolve(__dirname, ".."), // dist/ or scripts/
		resolve(__dirname, "../.."), // package root
	];
})();

/**
 * Resolve the package root (directory containing rules/). Used for bundled source and decompose.
 * Returns null if not running from the rule-composer package.
 */
export const getPackageRoot = async (): Promise<string | null> => {
	for (const root of PACKAGE_ROOT_CANDIDATES) {
		if (await exists(join(root, "rules"))) return root;
	}
	return null;
};

/**
 * Return the bundled rules/skills from the published package (useful for pnpm dlx when no local rules).
 * Uses package root resolution so it works from dist/ (published) or scripts/ (dev).
 */
export const getBundledSource = async (): Promise<DiscoveredSource | null> => {
	const root = await getPackageRoot();
	if (!root) return null;

	const bundledRulesDir = join(root, "rules");
	const bundledSkillsDir = join(root, "skills");
	const bundledAgentsDir = join(root, "agents");
	const bundledCommandsDir = join(root, "commands");

	const foundRules = await walkDir(bundledRulesDir, "bundled", "rule");
	const foundSkills = (await exists(bundledSkillsDir)) ? await walkDir(bundledSkillsDir, "bundled", "skill") : [];
	const foundAgents = (await exists(bundledAgentsDir))
		? await walkFlatMarkdownDir(bundledAgentsDir, "bundled", "agent")
		: [];
	const foundCommands = (await exists(bundledCommandsDir))
		? await walkFlatMarkdownDir(bundledCommandsDir, "bundled", "command")
		: [];

	const allFound = [...foundRules, ...foundSkills, ...foundAgents, ...foundCommands];
	if (allFound.length === 0) return null;

	const projectName = await getProjectDisplayName(root);
	return {
		id: "bundled",
		label: `Bundled (${projectName}) — ${allFound.length} files`,
		rules: allFound,
	};
};
