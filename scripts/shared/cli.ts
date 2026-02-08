import * as p from "@clack/prompts";
import color from "picocolors";
import type { ToolId, DiscoveredSource, RuleFile, OutputTarget } from "./types.js";
import { TOOL_IDS } from "./types.js";
import { TOOL_REGISTRY, TOOL_VARIABLES } from "./formats.js";
import { buildTree, treeMultiSelect, getSelectedRules } from "./tree-prompt.js";

/** Let user pick which detected sources to read from */
export const pickSources = async (
	detected: DiscoveredSource[],
	agentsRepo: DiscoveredSource | null,
): Promise<DiscoveredSource[]> => {
	const options = detected.map((s) => ({
		value: s.id,
		label: s.label,
		hint: undefined as string | undefined,
	}));

	if (agentsRepo) {
		options.push({
			value: agentsRepo.id,
			label: agentsRepo.label,
			hint: "bundled rules from agents repo",
		});
	}

	if (options.length === 0) {
		p.log.warn("No rule sources detected in the current directory.");
		return [];
	}

	const selected = await p.multiselect({
		message: "Select sources to read from",
		options,
		initialValues: options.map((o) => o.value),
		required: true,
	});

	if (p.isCancel(selected)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	const allSources = [...detected];
	if (agentsRepo) allSources.push(agentsRepo);

	return allSources.filter((s) => (selected as string[]).includes(s.id));
};

/** Tree-based rule selection */
export const selectRules = async (sources: DiscoveredSource[]): Promise<RuleFile[]> => {
	const tree = buildTree(sources);

	const result = await treeMultiSelect({
		message: "Select rules to include",
		tree,
	});

	if (typeof result === "symbol") {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	return result;
};

/** Pick target tool for placeholder resolution */
export const pickTargetTool = async (detected: DiscoveredSource[]): Promise<ToolId> => {
	// Auto-detect: if only one tool is detected in CWD, suggest it
	const detectedTools = detected.filter((s) => s.id !== "agents-repo").map((s) => s.id as ToolId);

	const options = TOOL_IDS.map((id) => ({
		value: id,
		label: TOOL_REGISTRY[id]?.name ?? id,
		hint: detectedTools.includes(id) ? "detected" : undefined,
	}));

	const initialValue = detectedTools[0] ?? "cursor";

	const selected = await p.select({
		message: "Target tool for placeholder resolution",
		options,
		initialValue,
	});

	if (p.isCancel(selected)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	return selected as ToolId;
};

/** Ask whether to optimize with LLM */
export const askOptimize = async (): Promise<boolean> => {
	const result = await p.confirm({
		message: "Optimize with LLM for token savings?",
		initialValue: false,
	});

	if (p.isCancel(result)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	return result;
};

/** Prompt for API key if not in env */
export const getApiKeyInteractive = async (): Promise<string | null> => {
	const envKey = process.env["OPENROUTER_API_KEY"];
	if (envKey) return envKey;

	const key = await p.password({
		message: "OpenRouter API key (or press Enter to skip)",
	});

	if (p.isCancel(key)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	return key || null;
};

/** Show diff preview between original and optimized */
export const showDiffPreview = (
	original: string,
	optimized: string,
	originalTokens: number,
	optimizedTokens: number,
): void => {
	const savings = originalTokens - optimizedTokens;
	const pct = Math.round((savings / originalTokens) * 100);

	p.log.info(`Before: ~${originalTokens} tokens | After: ~${optimizedTokens} tokens (${pct}% savings)`);
};

/** Ask to accept optimized version */
export const askAcceptOptimized = async (): Promise<boolean> => {
	const result = await p.confirm({
		message: "Accept optimized version?",
		initialValue: true,
	});

	if (p.isCancel(result)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	return result;
};

/** Pick output targets */
export const pickOutputTargets = async (detected: DiscoveredSource[], targetTool: ToolId): Promise<OutputTarget[]> => {
	const options: Array<{
		value: string;
		label: string;
		hint?: string;
	}> = [];

	// Always offer AGENTS.md
	options.push({
		value: "agents-md",
		label: "AGENTS.md",
		hint: "single composed file",
	});

	// Offer single-file options for common tools
	const singleFileOptions: Array<{
		value: string;
		label: string;
		path: string;
	}> = [
		{ value: "claude-md", label: "CLAUDE.md", path: "CLAUDE.md" },
		{ value: "cursorrules", label: ".cursorrules", path: ".cursorrules" },
		{ value: "windsurfrules", label: ".windsurfrules", path: ".windsurfrules" },
		{ value: "rules-file", label: ".rules (Zed)", path: ".rules" },
		{
			value: "conventions-md",
			label: "CONVENTIONS.md (Aider)",
			path: "CONVENTIONS.md",
		},
		{ value: "gemini-md", label: "GEMINI.md", path: "GEMINI.md" },
	];

	for (const opt of singleFileOptions) {
		options.push({ value: opt.value, label: opt.label });
	}

	// Offer directory targets for tools with rule directories
	const targetConfig = TOOL_REGISTRY[targetTool];
	if (targetConfig?.directories[0]) {
		options.push({
			value: `dir:${targetTool}`,
			label: `${targetConfig.directories[0]} (${targetConfig.name} directory)`,
			hint: "individual files",
		});
	}

	// Custom path option
	options.push({
		value: "other",
		label: "Other (specify path)",
		hint: "file or directory (end with /)",
	});

	const selected = await p.multiselect({
		message: "Write to:",
		options,
		initialValues: ["agents-md"],
		required: true,
	});

	if (p.isCancel(selected)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	const targets: OutputTarget[] = [];

	for (const sel of selected as string[]) {
		if (sel === "agents-md") {
			targets.push({ kind: "single-file", path: "AGENTS.md" });
		} else if (sel === "other") {
			const customPath = await p.text({
				message: "Enter output path (end with / for directory)",
				placeholder: "output/AGENTS.md or output/rules/",
			});

			if (p.isCancel(customPath)) {
				p.cancel("Operation cancelled.");
				process.exit(0);
			}

			const pathStr = (customPath as string).trim();
			if (pathStr.endsWith("/")) {
				targets.push({ kind: "directory", dir: pathStr, tool: targetTool });
			} else {
				targets.push({ kind: "single-file", path: pathStr });
			}
		} else if (sel.startsWith("dir:")) {
			const toolId = sel.replace("dir:", "") as ToolId;
			const config = TOOL_REGISTRY[toolId];
			if (config?.directories[0]) {
				targets.push({
					kind: "directory",
					dir: config.directories[0],
					tool: toolId,
				});
			}
		} else {
			const opt = singleFileOptions.find((o) => o.value === sel);
			if (opt) {
				targets.push({ kind: "single-file", path: opt.path });
			}
		}
	}

	return targets;
};
