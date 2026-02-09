import { readFile, access, stat, readdir } from "node:fs/promises";
import { join, resolve, basename, relative } from "node:path";
import * as p from "@clack/prompts";
import color from "picocolors";
import matter from "gray-matter";
import { splitByHeadings, type SplitResult } from "./splitter.js";
import { reconstructFromHeadings } from "./matcher.js";
import { getApiKeyInteractive } from "../shared/cli.js";
import { callLLM, resolvePromptPath } from "../shared/openrouter.js";
import { decomposeResponseSchema } from "../shared/schemas.js";
import type { DecomposeResponse } from "../shared/schemas.js";
import { getPackageRoot } from "../shared/scanner.js";
import { TOOL_IDS } from "../shared/types.js";
import {
	TOOL_REGISTRY,
	writeAsDirectory,
	formatMarkdown,
	ensureBlankLineAfterFrontmatter,
	detectSourceTool,
	replaceWithPlaceholders,
	extractSectionMetadata,
	inferRuleTypeFromPath,
	getOutputFilePathForRule,
	getLayoutRootAndRulesDir,
} from "../shared/formats.js";
import { resolveHashToRelative } from "../shared/link-resolution.js";
import type { ToolId, RuleFile } from "../shared/types.js";
import type { LLMMessage } from "../shared/openrouter.js";

/** Known single-file rule files to detect */
const SINGLE_FILE_RULES = [
	"AGENTS.md",
	"CLAUDE.md",
	"GEMINI.md",
	".cursorrules",
	".windsurfrules",
	".rules",
	"CONVENTIONS.md",
	".github/copilot-instructions.md",
	".junie/guidelines.md",
];

/** Check if a file exists */
const exists = async (path: string): Promise<boolean> => {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
};

/** List .md files in a directory; returns [] if dir does not exist. */
const listMarkdownInDir = async (dir: string): Promise<Array<{ name: string; path: string }>> => {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		const out: Array<{ name: string; path: string }> = [];
		for (const e of entries) {
			if (e.isFile() && e.name.endsWith(".md")) {
				out.push({ name: e.name, path: join(dir, e.name) });
			}
		}
		return out;
	} catch {
		return [];
	}
};

/** Collect agent/command files from a root (agents/, commands/, .cursor/agents/, .cursor/commands/). */
const listAgentsAndCommands = async (root: string): Promise<Array<{ name: string; path: string }>> => {
	const out: Array<{ name: string; path: string }> = [];
	for (const sub of ["agents", "commands", ".cursor/agents", ".cursor/commands"]) {
		const dir = join(root, sub);
		const files = await listMarkdownInDir(dir);
		for (const f of files) {
			out.push({ name: `${sub}/${f.name}`, path: f.path });
		}
	}
	return out;
};

/** Check if a line looks like a table row or list item */
const isTableOrList = (line: string): boolean => {
	const trimmed = line.trim();
	return (
		trimmed.startsWith("|") ||
		trimmed.startsWith("- ") ||
		trimmed.startsWith("* ") ||
		trimmed.startsWith("+ ") ||
		/^\d+\.\s/.test(trimmed)
	);
};

/**
 * Extract a prose description from split content.
 * Returns empty string if the first non-heading content is a table or list.
 */
export const extractProseDescription = (content: string): string => {
	const lines = content.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		if (isTableOrList(trimmed)) return "";
		return trimmed.slice(0, 120);
	}

	return "";
};

/**
 * Build rawContent with frontmatter for a decomposed rule.
 * Tools without frontmatter support get plain content.
 */
export const buildRawContent = (
	body: string,
	description: string,
	hasFrontmatter: boolean,
	options?: { globs?: string; alwaysApply?: boolean },
): string => {
	if (!hasFrontmatter) return body;

	const frontmatterData: Record<string, unknown> = {
		alwaysApply: options?.alwaysApply ?? true,
	};

	if (description) {
		frontmatterData["description"] = description;
	}

	if (options?.globs) {
		frontmatterData["globs"] = options.globs;
	}

	return ensureBlankLineAfterFrontmatter(matter.stringify(body, frontmatterData));
};

/**
 * Try to parse and validate a raw LLM response string as DecomposeResponse.
 * Returns the validated data or an error message.
 */
const tryParseResponse = (
	raw: string,
): { data: DecomposeResponse; error?: undefined } | { data?: undefined; error: string } => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { error: "Invalid JSON" };
	}

	const validated = decomposeResponseSchema.safeParse(parsed);
	if (!validated.success) {
		return { error: validated.error.issues.map((i) => i.message).join("; ") };
	}

	return { data: validated.data };
};

/**
 * AI-assisted decomposition with retry.
 * Attempt 1: send the decompose prompt.
 * Attempt 2 (on validation failure): resend with error feedback.
 * Falls back to heading-based split if both attempts fail.
 */
const aiDecompose = async (inputContent: string, apiKey: string): Promise<SplitResult[]> => {
	const promptPath = resolvePromptPath("decompose/prompt.md");
	let systemPrompt: string;
	try {
		systemPrompt = await readFile(promptPath, "utf-8");
	} catch {
		p.log.warn(color.yellow(`Failed to read prompt file. Using heading-based split.`));
		return splitByHeadings(inputContent);
	}

	const MAX_ATTEMPTS = 2;
	const messages: LLMMessage[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: inputContent },
	];

	const s = p.spinner();

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		s.start(attempt === 1 ? "Analyzing document with LLM..." : "Retrying with error feedback...");

		const result = await callLLM(messages, apiKey);

		if (!result.content) {
			s.stop(color.yellow(`LLM failed: ${result.error}`));
			if (attempt < MAX_ATTEMPTS) {
				// Add error context for retry
				messages.push(
					{ role: "assistant", content: "" },
					{
						role: "user",
						content: `API call failed: ${result.error}. Please try again. Return only a valid JSON array.`,
					},
				);
				continue;
			}
			p.log.warn("Falling back to heading-based split.");
			return splitByHeadings(inputContent);
		}

		const parseResult = tryParseResponse(result.content);

		if (parseResult.data) {
			// Reconstruct content from the source document
			const { splits, warnings } = reconstructFromHeadings(inputContent, parseResult.data);

			s.stop(`LLM proposed ${splits.length} rules`);

			// Surface warnings
			for (const w of warnings) {
				if (w.type === "unmatched-heading") {
					p.log.warn(color.yellow(`Heading "${w.heading}" not found in source (rule: ${w.rule})`));
				} else if (w.type === "unclaimed-section") {
					p.log.warn(color.yellow(`Section "${w.heading}" not assigned to any rule — content may be lost`));
				}
			}

			if (splits.length === 0) {
				p.log.warn("LLM returned headings that matched nothing. Falling back to heading-based split.");
				return splitByHeadings(inputContent);
			}

			return splits;
		}

		// Validation failed — set up retry
		s.stop(
			color.yellow(
				attempt < MAX_ATTEMPTS
					? `Attempt ${attempt} failed: ${parseResult.error}. Retrying...`
					: `Attempt ${attempt} failed: ${parseResult.error}. Falling back to heading-based split.`,
			),
		);

		if (attempt < MAX_ATTEMPTS) {
			messages.push(
				{ role: "assistant", content: result.content },
				{
					role: "user",
					content: `Your response failed validation: ${parseResult.error}. Fix the issues and return only a valid JSON array matching the schema. No preamble, no code fences.`,
				},
			);
		}
	}

	return splitByHeadings(inputContent);
};

export const runDecompose = async (cliInputPath?: string, outputPath?: string): Promise<void> => {
	const cwd = process.cwd();

	let inputPath: string;
	let inputName: string;

	if (cliInputPath) {
		const absPath = resolve(cwd, cliInputPath);
		const info = await stat(absPath).catch(() => null);

		if (!info) {
			p.log.error(`Path not found: ${absPath}`);
			return;
		}

		if (info.isDirectory()) {
			// Look for known single-file rules and agents/commands in the directory
			const found: Array<{ name: string; path: string }> = [];
			for (const file of SINGLE_FILE_RULES) {
				const filePath = join(absPath, file);
				if (await exists(filePath)) {
					found.push({ name: file, path: filePath });
				}
			}
			found.push(...(await listAgentsAndCommands(absPath)));

			if (found.length === 0) {
				p.log.error(
					`No rule files found in ${cliInputPath}. Looked for: ${SINGLE_FILE_RULES.join(", ")}, agents/*.md, commands/*.md`,
				);
				return;
			}

			if (found.length === 1) {
				inputPath = found[0]!.path;
				inputName = found[0]!.name;
			} else {
				const choice = await p.select({
					message: "Multiple rule files found. Select one:",
					options: found.map((d) => ({ value: d.path, label: d.name })),
				});

				if (p.isCancel(choice)) {
					p.cancel("Operation cancelled.");
					process.exit(0);
				}

				inputPath = choice as string;
				inputName = found.find((d) => d.path === inputPath)?.name ?? basename(inputPath);
			}
		} else {
			inputPath = absPath;
			inputName = basename(absPath);
		}
	} else {
		// 1. Detect single-file rules and agents/commands in CWD and in bundled package
		const detected: Array<{ name: string; path: string }> = [];

		for (const file of SINGLE_FILE_RULES) {
			const filePath = join(cwd, file);
			if (await exists(filePath)) {
				detected.push({ name: file, path: filePath });
			}
		}
		detected.push(...(await listAgentsAndCommands(cwd)));

		const bundledRoot = await getPackageRoot();
		if (bundledRoot) {
			for (const file of SINGLE_FILE_RULES) {
				const filePath = join(bundledRoot, file);
				if (await exists(filePath)) {
					detected.push({ name: `Bundled: ${file}`, path: filePath });
				}
			}
			const bundledAc = await listAgentsAndCommands(bundledRoot);
			for (const d of bundledAc) {
				detected.push({ name: `Bundled: ${d.name}`, path: d.path });
			}
		}

		if (detected.length === 0) {
			p.log.warn("No rule files detected in the current directory or bundled package.");
			p.log.info(`Looked for: ${SINGLE_FILE_RULES.join(", ")}, agents/*.md, commands/*.md`);
			return;
		}

		// 2. Pick input file
		const inputChoice = await p.select({
			message: "Select input file to decompose",
			options: detected.map((d) => ({
				value: d.path,
				label: d.name,
			})),
		});

		if (p.isCancel(inputChoice)) {
			p.cancel("Operation cancelled.");
			process.exit(0);
		}

		inputPath = inputChoice as string;
		inputName = detected.find((d) => d.path === inputPath)?.name ?? basename(inputPath);
	}

	const inputContent = await readFile(inputPath, "utf-8");

	p.log.info(`Read ${inputContent.split("\n").length} lines from ${inputName}`);

	// 3. Pick split strategy
	const strategy = await p.select({
		message: "Split strategy",
		options: [
			{
				value: "headings",
				label: "Heading-based (split on ## boundaries, no LLM needed)",
			},
			{
				value: "ai",
				label: "AI-assisted (smarter boundaries via LLM)",
			},
		],
	});

	if (p.isCancel(strategy)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	let splits: SplitResult[];

	if (strategy === "ai") {
		const apiKey = await getApiKeyInteractive();

		if (apiKey) {
			splits = await aiDecompose(inputContent, apiKey);
		} else {
			p.log.warn("No API key. Falling back to heading-based split.");
			splits = splitByHeadings(inputContent);
		}
	} else {
		splits = splitByHeadings(inputContent);
	}

	p.log.info(`Found ${splits.length} rule sections:`);

	// 4. Let user pick which sections to extract
	const selectedSplits = await p.multiselect({
		message: "Select sections to extract",
		options: splits.map((split, i) => {
			const lines = split.content.split("\n").length;
			const displayName = split.directory ? `${split.directory}/${split.name}` : split.name;
			return {
				value: i,
				label: displayName,
				hint: `${split.description} (${lines} lines)`,
			};
		}),
		initialValues: splits.map((_, i) => i),
		required: true,
	});

	if (p.isCancel(selectedSplits)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	splits = (selectedSplits as number[]).map((i) => splits[i]!);

	if (splits.length === 0) {
		p.log.warn("No sections selected.");
		return;
	}

	// 4.5. Numbered file prefix toggle
	const wantsNumbered = await p.confirm({
		message: "Add numbered prefixes to filenames? (e.g. 01-approach.mdc)",
		initialValue: true,
	});

	if (p.isCancel(wantsNumbered)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	const numbered = !!wantsNumbered;

	// 5. Detect tool-specific paths and offer placeholder replacement
	const combinedContent = splits.map((s) => s.content).join("\n");
	const detectedTool = detectSourceTool(combinedContent);

	if (detectedTool) {
		const toolName = TOOL_REGISTRY[detectedTool]?.name ?? detectedTool;
		const { replacements } = replaceWithPlaceholders(combinedContent, detectedTool);

		if (replacements.length > 0) {
			p.log.info(`Detected ${color.cyan(toolName)}-specific paths in the content:`);
			for (const r of replacements) {
				p.log.message(
					`  ${color.dim(r.value)} → ${color.green(`{{${r.variable}}}`)} ${color.dim(`(${r.count}×`)}`,
				);
			}

			const shouldReplace = await p.confirm({
				message: `Replace with {{PLACEHOLDER}} syntax for cross-tool compatibility?`,
				initialValue: true,
			});

			if (p.isCancel(shouldReplace)) {
				p.cancel("Operation cancelled.");
				process.exit(0);
			}

			if (shouldReplace) {
				splits = splits.map((split) => {
					const { content } = replaceWithPlaceholders(split.content, detectedTool);
					return { ...split, content };
				});
				p.log.success("Replaced tool-specific paths with placeholders.");
			}
		}
	}

	// 6. Pick output tool format
	const toolChoice = await p.select({
		message: "Output tool format",
		options: TOOL_IDS.map((id) => ({
			value: id,
			label: TOOL_REGISTRY[id]?.name ?? id,
		})),
		initialValue: "cursor" as ToolId,
	});

	if (p.isCancel(toolChoice)) {
		p.cancel("Operation cancelled.");
		process.exit(0);
	}

	const toolId = toolChoice as ToolId;

	// 7. Pick output directory
	let outputDir: string;
	if (outputPath) {
		outputDir = outputPath.endsWith("/") ? outputPath : outputPath;
		p.log.info(`Output directory: ${outputDir}`);
	} else {
		const defaultDir = TOOL_REGISTRY[toolId]?.directories[0] ?? "rules/";
		const dirChoice = await p.text({
			message: "Output directory",
			initialValue: defaultDir,
			placeholder: defaultDir,
		});

		if (p.isCancel(dirChoice)) {
			p.cancel("Operation cancelled.");
			process.exit(0);
		}
		outputDir = dirChoice as string;
	}

	// 8. Convert splits to RuleFiles and write
	const inputFileType = inferRuleTypeFromPath(inputPath);
	const toolConfig = TOOL_REGISTRY[toolId];
	const hasFrontmatter = toolConfig?.hasFrontmatter ?? false;
	const ext = toolConfig?.extension || ".md";

	// Build section number → output filename map for hash→relative link resolution
	const sectionMap = new Map<number, string>();
	splits.forEach((split, i) => {
		const prefix = numbered ? `${String(i + 1).padStart(2, "0")}-` : "";
		const filename = `${prefix}${split.name}${ext}`;
		sectionMap.set(i + 1, filename);
	});

	const ruleFiles: RuleFile[] = splits.map((split) => {
		const { content: cleaned, description: metaDesc, globs, alwaysApply, type: sectionType } =
			extractSectionMetadata(split.content);
		const cleanContent = resolveHashToRelative(cleaned, sectionMap);
		const description = metaDesc ?? extractProseDescription(cleanContent);
		const rawContent = buildRawContent(cleanContent, description, hasFrontmatter, {
			globs,
			alwaysApply,
		});
		// Use > [!type] from composed monolith when present so skills/agents/commands restore to the right dirs
		const ruleType = sectionType ?? inputFileType;

		return {
			path: "",
			name: split.name,
			description,
			body: cleanContent,
			rawContent,
			source: toolId,
			type: ruleType,
			hasPlaceholders: /\{\{\w+\}\}/.test(cleanContent),
			directory: split.directory,
			globs,
			alwaysApply,
		};
	});

	// 9. Check for existing files that would be overwritten (canonical layout: rules/, skills/, agents/, commands/)
	const { layoutRoot } = getLayoutRootAndRulesDir(outputDir);
	const existingFiles: string[] = [];
	let ruleIndex = 0;
	for (const rule of ruleFiles) {
		const filePath = getOutputFilePathForRule(rule, outputDir, toolId, {
			numbered,
			ruleIndex: rule.type === "rule" ? ruleIndex + 1 : undefined,
		});
		if (rule.type === "rule") ruleIndex += 1;
		if (await exists(filePath)) {
			existingFiles.push(relative(layoutRoot, filePath) || filePath);
		}
	}

	if (existingFiles.length > 0) {
		p.log.warn(`${existingFiles.length} file(s) already exist in ${outputDir}:`);
		for (const file of existingFiles) {
			p.log.message(`  ${color.yellow(file)}`);
		}

		const confirmOverwrite = await p.confirm({
			message: `Overwrite ${existingFiles.length} existing file(s)?`,
			initialValue: false,
		});

		if (p.isCancel(confirmOverwrite) || !confirmOverwrite) {
			p.cancel("Operation cancelled.");
			process.exit(0);
		}
	}

	// 10. Format and write files
	const s = p.spinner();
	s.start("Formatting & writing files...");

	const formattedRules = await Promise.all(
		ruleFiles.map(async (rule) => ({
			...rule,
			body: await formatMarkdown(rule.body),
			rawContent: await formatMarkdown(rule.rawContent),
		})),
	);

	await writeAsDirectory(formattedRules, outputDir, toolId, {
		numbered,
	});
	s.stop(`Written ${formattedRules.length} files to ${outputDir}`);
};
