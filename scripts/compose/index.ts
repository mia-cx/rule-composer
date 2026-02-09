import { resolve } from "node:path";
import { stat, mkdir } from "node:fs/promises";
import * as p from "@clack/prompts";
import color from "picocolors";
import { detectTools, getBundledSource, resolveAgentsRepo, scanDirectory } from "../shared/scanner.js";
import { readRule } from "../shared/formats.js";
import {
	selectRules,
	pickTargetTool,
	askOptimize,
	getApiKeyInteractive,
	showDiffPreview,
	askAcceptOptimized,
	pickOutputTargets,
} from "../shared/cli.js";
import { compose, estimateTokens } from "./composer.js";
import { writeAsSingleFile, writeAsDirectory, formatMarkdown } from "../shared/formats.js";
import { optimize, resolvePromptPath } from "../shared/openrouter.js";
import { generateVariants } from "./variants.js";
import type { DiscoveredSource, OutputTarget } from "../shared/types.js";

/** Build the list of sources for the tree (detected + agents-repo + bundled when no input path). Bundled is always included when available so e.g. pnpm dlx can compose from package rules. */
export const buildComposeSources = (
	detected: DiscoveredSource[],
	agentsRepo: DiscoveredSource | null,
	bundled: DiscoveredSource | null,
	hasInputPath: boolean,
): DiscoveredSource[] => {
	if (hasInputPath) return detected;
	const withAgents = agentsRepo ? [...detected, agentsRepo] : detected;
	// Add bundled if we have it and it's not already agentsRepo (tier-3 fallback)
	const addBundled = bundled && (!agentsRepo || agentsRepo.id === "agents-repo");
	return addBundled ? [...withAgents, bundled] : withAgents;
};

export const runCompose = async (inputPath?: string, outputPath?: string): Promise<void> => {
	const cwd = process.cwd();

	let detected: DiscoveredSource[];
	let agentsRepo: DiscoveredSource | null;

	if (inputPath) {
		const absPath = resolve(cwd, inputPath);
		const info = await stat(absPath).catch(() => null);

		if (!info) {
			p.log.error(`Path not found: ${absPath}`);
			return;
		}

		if (info.isDirectory()) {
			const source = await scanDirectory(absPath);
			if (source.rules.length === 0) {
				p.log.error(`No rule files found in ${absPath}`);
				return;
			}
			p.log.info(`Scanning ${inputPath}: ${source.rules.length} rules found`);
			detected = [source];
		} else {
			const rule = await readRule(absPath, "agents-repo", "rule");
			p.log.info(`Reading ${inputPath} as single rule`);
			detected = [
				{
					id: "agents-repo",
					label: inputPath,
					rules: [rule],
				},
			];
		}
		agentsRepo = null;
	} else {
		// 1. Detect tools in CWD
		detected = await detectTools(cwd);
		agentsRepo = await resolveAgentsRepo(cwd);
		if (detected.length > 0) {
			p.log.info("Detected tools in CWD:");
			for (const source of detected) {
				p.log.message(`  ${source.label}`);
			}
		}
	}

	// 2. Build sources (detected + agents-repo + bundled when no input path)
	const bundled = inputPath ? null : await getBundledSource();
	const sources = buildComposeSources(detected, agentsRepo, bundled, !!inputPath);
	if (sources.length === 0) {
		p.log.error("No sources to read from.");
		return;
	}

	// 3. Select rules via tree (sources form top-level directories in the tree)
	let selectedRules = await selectRules(sources);
	if (selectedRules.length === 0) {
		p.log.error("No rules selected.");
		return;
	}

	// 3.5. Optional reorder
	if (selectedRules.length > 1) {
		p.log.info("Current section order:");
		selectedRules.forEach((rule, i) => {
			p.log.message(`  ${color.dim(`${i + 1}.`)} ${rule.name}`);
		});

		const wantsReorder = await p.confirm({
			message: "Reorder sections?",
			initialValue: false,
		});

		if (p.isCancel(wantsReorder)) {
			p.cancel("Operation cancelled.");
			process.exit(0);
		}

		if (wantsReorder) {
			const defaultOrder = selectedRules.map((_, i) => i + 1).join(",");
			const orderInput = await p.text({
				message: "Enter new order (comma-separated numbers)",
				placeholder: defaultOrder,
				initialValue: defaultOrder,
				validate: (value) => {
					const indices = value.split(",").map((s) => parseInt(s.trim(), 10));
					if (indices.length !== selectedRules.length) {
						return `Expected ${selectedRules.length} numbers, got ${indices.length}`;
					}
					if (indices.some((n) => isNaN(n) || n < 1 || n > selectedRules.length)) {
						return `Numbers must be between 1 and ${selectedRules.length}`;
					}
					const unique = new Set(indices);
					if (unique.size !== indices.length) {
						return "Each number must appear exactly once";
					}
					return undefined;
				},
			});

			if (p.isCancel(orderInput)) {
				p.cancel("Operation cancelled.");
				process.exit(0);
			}

			const indices = (orderInput as string).split(",").map((s) => parseInt(s.trim(), 10) - 1);
			selectedRules = indices.map((i) => selectedRules[i]!);
		}
	}

	// 4. Pick target tool for placeholders
	const targetTool = await pickTargetTool(detected);

	// 4.5. Numbering toggle
	const wantsNumbering = await p.confirm({
		message: "Add numbered prefixes to section headings?",
		initialValue: true,
	});

	if (p.isCancel(wantsNumbering)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	const startMs = Date.now();

	// 5. Compose (returns Prettier-formatted content)
	const { content, placeholderCount } = await compose(selectedRules, targetTool, {
		numbered: !!wantsNumbering,
	});
	const tokens = estimateTokens(content);
	const lines = content.split("\n").length;

	p.log.success(
		`Composed: ${lines} lines (~${tokens} tokens)` +
			(placeholderCount > 0 ? ` • Resolved ${placeholderCount} placeholders for ${targetTool}` : ""),
	);

	// 6. Optional LLM optimization
	let finalContent = content;

	const wantsOptimize = await askOptimize();
	if (wantsOptimize) {
		const apiKey = await getApiKeyInteractive();

		if (apiKey) {
			const s = p.spinner();
			s.start("Optimizing...");

			const promptPath = resolvePromptPath("compose/prompt.md");
			const result = await optimize(content, apiKey, promptPath);

			if (result.optimized) {
				s.stop("Optimization complete");

				const optimizedTokens = estimateTokens(result.optimized);
				showDiffPreview(content, result.optimized, tokens, optimizedTokens);

				const accept = await askAcceptOptimized();
				if (accept) {
					finalContent = result.optimized;
				}
			} else {
				s.stop(color.yellow(`Optimization failed: ${result.error}`));
				p.log.warn("Using raw (non-optimized) version.");
			}
		} else {
			p.log.warn("No API key provided. Skipping optimization.");
		}
	}

	// 7. Determine output targets
	let targets: OutputTarget[];
	if (outputPath) {
		if (outputPath.endsWith("/")) {
			await mkdir(outputPath, { recursive: true });
			targets = [{ kind: "directory", dir: outputPath, tool: targetTool }];
		} else {
			targets = [{ kind: "single-file", path: outputPath }];
		}
	} else {
		targets = await pickOutputTargets(detected, targetTool);
	}

	// 8. Format and write to targets
	const s = p.spinner();
	s.start("Formatting & writing...");

	const formattedContent = await formatMarkdown(finalContent);

	// Format each rule for directory writes
	const formattedRules = await Promise.all(
		selectedRules.map(async (rule) => ({
			...rule,
			body: await formatMarkdown(rule.body),
			rawContent: await formatMarkdown(rule.rawContent),
		})),
	);

	for (const target of targets) {
		if (target.kind === "single-file") {
			await writeAsSingleFile(formattedContent, target.path);
			p.log.success(`  ${target.path} (single file)`);
		} else {
			await writeAsDirectory(formattedRules, target.dir, target.tool);
			p.log.success(`  ${target.dir} (${selectedRules.length} files)`);
		}
	}

	// 9. Regenerate coding-tools/ variants
	const variantResults = await generateVariants();
	const totalTools = variantResults.length;

	const n = selectedRules.length;
	const filesWritten = targets.reduce((acc, t) => acc + (t.kind === "single-file" ? 1 : selectedRules.length), 0);
	const linesWritten = targets.reduce(
		(acc, t) =>
			acc +
			(t.kind === "single-file"
				? formattedContent.split("\n").length
				: formattedRules.reduce((sum, r) => sum + r.body.split("\n").length, 0)),
		0,
	);
	const tokensWritten = targets.reduce(
		(acc, t) =>
			acc +
			(t.kind === "single-file"
				? estimateTokens(formattedContent)
				: formattedRules.reduce((sum, r) => sum + estimateTokens(r.body), 0)),
		0,
	);
	const elapsedMs = Date.now() - startMs;
	const t = elapsedMs < 1000 ? `${elapsedMs} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;

	s.stop(`Written to ${targets.length} target(s)`);
	p.log.info(`Regenerated coding-tools/ (${totalTools} tools)`);
	p.log.success(
		`Composed ${n} rules. Created ${filesWritten} files. ${linesWritten} lines, ~${tokensWritten} tokens. Took ${t}.`,
	);
};
