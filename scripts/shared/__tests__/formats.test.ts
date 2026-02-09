import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	resolvePlaceholders,
	detectSourceTool,
	replaceWithPlaceholders,
	readRule,
	writeAsDirectory,
	writeAsSingleFile,
	extractGlobAnnotation,
	extractSectionMetadata,
	unquoteGlobs,
	ensureBlankLineAfterFrontmatter,
	TOOL_REGISTRY,
	TOOL_VARIABLES,
} from "../formats.js";
import { TOOL_IDS } from "../types.js";

describe("TOOL_REGISTRY", () => {
	it("has an entry for every tool ID", () => {
		for (const id of TOOL_IDS) {
			expect(TOOL_REGISTRY[id]).toBeDefined();
			expect(TOOL_REGISTRY[id]!.id).toBe(id);
			expect(TOOL_REGISTRY[id]!.name).toBeTruthy();
		}
	});

	it("tool-specific config: cursor has .cursor/rules/.mdc and frontmatter; claude has no frontmatter", () => {
		expect(TOOL_REGISTRY.cursor.directories).toContain(".cursor/rules/");
		expect(TOOL_REGISTRY.cursor.extension).toBe(".mdc");
		expect(TOOL_REGISTRY.cursor.hasFrontmatter).toBe(true);
		expect(TOOL_REGISTRY.claude.hasFrontmatter).toBe(false);
	});
});

describe("TOOL_VARIABLES", () => {
	it("has an entry for every tool ID", () => {
		for (const id of TOOL_IDS) {
			expect(TOOL_VARIABLES[id]).toBeDefined();
			expect(TOOL_VARIABLES[id]!["TOOL_NAME"]).toBeTruthy();
		}
	});

	it("cursor has all expected keys; claude has empty skills/agents/commands vars", () => {
		const cursor = TOOL_VARIABLES.cursor;
		expect(cursor["RULES_DIR"]).toBe(".cursor/rules/");
		expect(cursor["RULES_EXT"]).toBe(".mdc");
		expect(cursor["SKILLS_DIR"]).toBe(".cursor/skills/");
		expect(cursor["AGENTS_DIR"]).toBe(".cursor/agents/");
		expect(cursor["COMMANDS_DIR"]).toBe(".cursor/commands/");
		expect(cursor["GLOBAL_RULES"]).toBe("~/.cursor/rules/");
		expect(cursor["GLOBAL_SKILLS"]).toBe("~/.cursor/skills/");
		expect(TOOL_VARIABLES.claude["SKILLS_DIR"]).toBe("");
		expect(TOOL_VARIABLES.claude["SKILLS_EXT"]).toBe("");
		expect(TOOL_VARIABLES.claude["GLOBAL_SKILLS"]).toBe("");
		expect(TOOL_VARIABLES.claude["AGENTS_DIR"]).toBe("");
		expect(TOOL_VARIABLES.claude["COMMANDS_DIR"]).toBe("");
	});

	it("every tool has same variable keys (exhaustive map)", () => {
		const keys = Object.keys(TOOL_VARIABLES.cursor).sort();
		for (const id of TOOL_IDS) {
			expect(Object.keys(TOOL_VARIABLES[id]!).sort()).toEqual(keys);
		}
	});
});

describe("ensureBlankLineAfterFrontmatter", () => {
	it("inserts blank line when closing --- is directly followed by content", () => {
		const input = "---\nalwaysApply: true\n---\n## Heading\n\nBody.";
		const result = ensureBlankLineAfterFrontmatter(input);
		expect(result).toMatch(/---\r?\n\r?\n##/);
		expect(result).toBe("---\nalwaysApply: true\n---\n\n## Heading\n\nBody.");
	});

	it("leaves content unchanged when blank line already present or no frontmatter", () => {
		expect(ensureBlankLineAfterFrontmatter("---\nalwaysApply: true\n---\n\n## Heading\n\nBody.")).toBe(
			"---\nalwaysApply: true\n---\n\n## Heading\n\nBody.",
		);
		expect(ensureBlankLineAfterFrontmatter("## Only heading\n\nNo frontmatter.")).toBe(
			"## Only heading\n\nNo frontmatter.",
		);
	});
});

describe("resolvePlaceholders", () => {
	it("replaces known placeholders with tool values", () => {
		const input = "Use {{TOOL_NAME}} with {{RULES_DIR}} files";
		const result = resolvePlaceholders(input, "cursor");
		expect(result).toBe("Use Cursor with .cursor/rules/ files");
	});

	it("resolves for claude with different values", () => {
		const input = "Rules live in {{RULES_DIR}}";
		const result = resolvePlaceholders(input, "claude");
		expect(result).toBe("Rules live in .claude/rules/");
	});

	it("removes entire line when placeholder resolves to empty string", () => {
		const input = [
			"Line 1: rules at {{RULES_DIR}}",
			"Line 2: skills at {{SKILLS_DIR}}",
			"Line 3: no placeholders",
		].join("\n");
		// Claude has SKILLS_DIR = ''
		const result = resolvePlaceholders(input, "claude");
		const lines = result.split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toBe("Line 1: rules at .claude/rules/");
		expect(lines[1]).toBe("Line 3: no placeholders");
	});

	it("keeps unknown placeholders as-is and leaves content with no placeholders unchanged", () => {
		expect(resolvePlaceholders("Unknown: {{DOES_NOT_EXIST}}", "cursor")).toBe("Unknown: {{DOES_NOT_EXIST}}");
		expect(resolvePlaceholders("No placeholders here\nJust plain text", "cursor")).toBe(
			"No placeholders here\nJust plain text",
		);
	});

	it("resolves AGENTS_DIR and COMMANDS_DIR for Cursor; removes line for tools without them", () => {
		const line = "Subagents in {{AGENTS_DIR}}, commands in {{COMMANDS_DIR}}.";
		expect(resolvePlaceholders(line, "cursor")).toBe(
			"Subagents in .cursor/agents/, commands in .cursor/commands/.",
		);
		expect(resolvePlaceholders(line, "claude")).toBe("");
	});

	it("handles multiple placeholders on the same line", () => {
		const input = "{{RULES_DIR}}*{{RULES_EXT}}";
		const result = resolvePlaceholders(input, "cursor");
		expect(result).toBe(".cursor/rules/*.mdc");
	});

	it("removes line if any placeholder resolves to empty", () => {
		// All empty
		expect(resolvePlaceholders("{{SKILLS_DIR}} and {{GLOBAL_SKILLS}} both", "copilot")).toBe("");
		// Mixed: TOOL_NAME is non-empty but SKILLS_DIR is empty → line still removed
		expect(resolvePlaceholders("{{TOOL_NAME}} skills: {{SKILLS_DIR}}", "copilot")).toBe("");
	});

	it("removes many lines for tools with mostly empty vars (zed)", () => {
		const input = [
			"Static line",
			"Rules: {{RULES_DIR}}",
			"Skills: {{SKILLS_DIR}}",
			"Global: {{GLOBAL_RULES}}",
			"Another static line",
		].join("\n");
		const result = resolvePlaceholders(input, "zed");
		const lines = result.split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toBe("Static line");
		expect(lines[1]).toBe("Another static line");
	});
});

describe("detectSourceTool", () => {
	it.each([
		["cursor", "Put rules in `.cursor/rules/` and skills in `.cursor/skills/`."],
		["claude", "Store rules in `.claude/rules/` for Claude Code."],
		["copilot", "Place instructions in `.github/instructions/` with `.instructions.md` extension."],
	])("detects %s from tool-specific paths", (tool, content) => {
		expect(detectSourceTool(content)).toBe(tool);
	});

	it("returns null when no tool paths found or values shorter than 4 chars", () => {
		expect(detectSourceTool("This is a generic document with no tool-specific paths.")).toBeNull();
		expect(detectSourceTool("Use .md files for documentation.")).toBeNull();
	});

	it("picks the tool with the most/strongest matches", () => {
		const content = [
			"Rules: .cursor/rules/",
			"Skills: .cursor/skills/",
			"Global: ~/.cursor/rules/",
			"Also mentioned: .claude/rules/",
		].join("\n");
		expect(detectSourceTool(content)).toBe("cursor");
	});
});

describe("replaceWithPlaceholders", () => {
	it("replaces cursor paths with placeholders", () => {
		const input = "Put rules in `.cursor/rules/` for Cursor.";
		const { content, replacements } = replaceWithPlaceholders(input, "cursor");
		expect(content).toBe("Put rules in `{{RULES_DIR}}` for {{TOOL_NAME}}.");
		expect(replacements.length).toBeGreaterThan(0);
	});

	it("replaces longest matches first to avoid partial replacements", () => {
		// RULE_EXAMPLE (.cursor/rules/my-convention.mdc) contains RULES_DIR (.cursor/rules/)
		// Longest-first ensures RULE_EXAMPLE is replaced as a whole
		const input = "Example: .cursor/rules/my-convention.mdc";
		const { content } = replaceWithPlaceholders(input, "cursor");
		expect(content).toBe("Example: {{RULE_EXAMPLE}}");
	});

	it("skips values shorter than 4 characters", () => {
		// Claude's RULES_EXT is ".md" (3 chars) — should not be replaced
		const input = "Use .md files in `.claude/rules/`.";
		const { content, replacements } = replaceWithPlaceholders(input, "claude");
		expect(content).toContain(".md");
		expect(content).toContain("{{RULES_DIR}}");
		const extReplacement = replacements.find((r) => r.variable === "RULES_EXT");
		expect(extReplacement).toBeUndefined();
	});

	it("reports replacement counts accurately", () => {
		const input = ["First: .cursor/rules/", "Second: .cursor/rules/", "Third: .cursor/skills/"].join("\n");
		const { replacements } = replaceWithPlaceholders(input, "cursor");
		const rulesDir = replacements.find((r) => r.variable === "RULES_DIR");
		const skillsDir = replacements.find((r) => r.variable === "SKILLS_DIR");
		expect(rulesDir?.count).toBe(2);
		expect(skillsDir?.count).toBe(1);
	});

	it("returns unchanged content for tools with no matching values", () => {
		const input = "Generic content with no tool paths.";
		const { content, replacements } = replaceWithPlaceholders(input, "cursor");
		expect(content).toBe(input);
		expect(replacements).toHaveLength(0);
	});

	it("handles multiple variable replacements across content", () => {
		const input = [
			"Use Cursor for editing.",
			"Rules go in .cursor/rules/ with .mdc extension.",
			"Skills go in .cursor/skills/ as SKILL.md files.",
			"Global rules at ~/.cursor/rules/.",
		].join("\n");
		const { content, replacements } = replaceWithPlaceholders(input, "cursor");
		expect(content).toContain("{{TOOL_NAME}}");
		expect(content).toContain("{{RULES_DIR}}");
		expect(content).toContain("{{SKILLS_DIR}}");
		expect(content).toContain("{{RULES_EXT}}");
		expect(content).toContain("{{SKILLS_EXT}}");
		expect(content).toContain("{{GLOBAL_RULES}}");
		expect(replacements.length).toBeGreaterThanOrEqual(6);
	});
});

describe("readRule", () => {
	const tmpDir = join(tmpdir(), "arc-test-readrule");

	beforeAll(async () => {
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("parses .mdc file with frontmatter", async () => {
		const filePath = join(tmpDir, "test-rule.mdc");
		const content = [
			"---",
			"description: A test rule",
			"alwaysApply: true",
			"---",
			"",
			"# Test Rule",
			"",
			"Some content here.",
		].join("\n");
		await writeFile(filePath, content, "utf-8");

		const rule = await readRule(filePath, "cursor");
		expect(rule.name).toBe("test-rule");
		expect(rule.description).toBe("A test rule");
		expect(rule.body).toContain("# Test Rule");
		expect(rule.body).toContain("Some content here.");
		expect(rule.body).not.toContain("---");
		expect(rule.source).toBe("cursor");
		expect(rule.type).toBe("rule");
		expect(rule.hasPlaceholders).toBe(false);
	});

	it("parses .md file without frontmatter", async () => {
		const filePath = join(tmpDir, "plain-rule.md");
		const content = "# Plain Rule\n\nThis is a plain rule.";
		await writeFile(filePath, content, "utf-8");

		const rule = await readRule(filePath, "claude");
		expect(rule.name).toBe("plain-rule");
		expect(rule.description).toBe("This is a plain rule.");
		expect(rule.body).toBe(content);
		expect(rule.hasPlaceholders).toBe(false);
	});

	it("detects placeholders in content", async () => {
		const filePath = join(tmpDir, "dynamic-rule.mdc");
		const content = ["---", "description: Dynamic rule", "---", "", "Use {{RULES_DIR}} for rules."].join("\n");
		await writeFile(filePath, content, "utf-8");

		const rule = await readRule(filePath, "agents-repo");
		expect(rule.hasPlaceholders).toBe(true);
	});

	it("strips .instructions suffix from copilot files", async () => {
		const filePath = join(tmpDir, "my-rule.instructions.md");
		await writeFile(filePath, "# My Rule", "utf-8");

		const rule = await readRule(filePath, "copilot");
		expect(rule.name).toBe("my-rule");
	});

	it("handles skill type", async () => {
		const filePath = join(tmpDir, "SKILL.md");
		await writeFile(filePath, "# My Skill\n\nDo things.", "utf-8");

		const rule = await readRule(filePath, "cursor", "skill");
		expect(rule.type).toBe("skill");
	});
});

describe("writeAsSingleFile", () => {
	const tmpDir = join(tmpdir(), "arc-test-write-single");

	beforeAll(async () => {
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("writes content to the specified path", async () => {
		const filePath = join(tmpDir, "output.md");
		await writeAsSingleFile("# Hello World", filePath);

		const { readFile: rf } = await import("node:fs/promises");
		const content = await rf(filePath, "utf-8");
		expect(content).toBe("# Hello World");
	});
});

describe("writeAsDirectory", () => {
	const tmpDir = join(tmpdir(), "arc-test-write-dir");

	beforeAll(async () => {
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("writes rules as individual files with correct extension", async () => {
		const outDir = join(tmpDir, "claude-out");
		const rules = [
			{
				path: "/fake/path/coding.mdc",
				name: "coding",
				description: "Coding rules",
				body: "# Coding\n\nRules here.",
				rawContent: "# Coding\n\nRules here.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
			},
		];

		await writeAsDirectory(rules, outDir, "claude");

		const { readFile: rf } = await import("node:fs/promises");
		const content = await rf(join(outDir, "coding.md"), "utf-8");
		expect(content).toBe("# Coding\n\nRules here.");
	});

	it("writes rules into subdirectories when directory is set", async () => {
		const outDir = join(tmpDir, "subdir-out");
		const rules = [
			{
				path: "",
				name: "unit-tests",
				description: "Unit testing rules",
				body: "# Unit Tests\n\nUse Vitest.",
				rawContent: "# Unit Tests\n\nUse Vitest.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
				directory: "testing",
			},
			{
				path: "",
				name: "approach",
				description: "General approach",
				body: "# Approach\n\nPlan first.",
				rawContent: "# Approach\n\nPlan first.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
			},
		];

		await writeAsDirectory(rules, outDir, "claude");

		const { readFile: rf } = await import("node:fs/promises");

		// Rule with directory should be in subdirectory
		const subContent = await rf(join(outDir, "testing", "unit-tests.md"), "utf-8");
		expect(subContent).toBe("# Unit Tests\n\nUse Vitest.");

		// Rule without directory should be at root
		const rootContent = await rf(join(outDir, "approach.md"), "utf-8");
		expect(rootContent).toBe("# Approach\n\nPlan first.");
	});

	it("writes rules into nested subdirectories", async () => {
		const outDir = join(tmpDir, "nested-out");
		const rules = [
			{
				path: "",
				name: "cloudflare",
				description: "Cloudflare deploy rules",
				body: "# Cloudflare\n\nUse Wrangler.",
				rawContent: "# Cloudflare\n\nUse Wrangler.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
				directory: "infrastructure/deploy",
			},
		];

		await writeAsDirectory(rules, outDir, "claude");

		const { readFile: rf } = await import("node:fs/promises");
		const content = await rf(join(outDir, "infrastructure", "deploy", "cloudflare.md"), "utf-8");
		expect(content).toBe("# Cloudflare\n\nUse Wrangler.");
	});

	it("writes numbered file prefixes when numbered option is true", async () => {
		const outDir = join(tmpDir, "numbered-out");
		const rules = [
			{
				path: "",
				name: "approach",
				description: "Approach rules",
				body: "# Approach\n\nPlan first.",
				rawContent: "# Approach\n\nPlan first.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
			},
			{
				path: "",
				name: "coding",
				description: "Coding rules",
				body: "# Coding\n\nEarly returns.",
				rawContent: "# Coding\n\nEarly returns.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
			},
			{
				path: "",
				name: "testing",
				description: "Testing rules",
				body: "# Testing\n\nUse Vitest.",
				rawContent: "# Testing\n\nUse Vitest.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
			},
		];

		await writeAsDirectory(rules, outDir, "claude", { numbered: true });

		const { readFile: rf } = await import("node:fs/promises");

		// Verify filenames have zero-padded prefixes
		const f1 = await rf(join(outDir, "01-approach.md"), "utf-8");
		expect(f1).toBe("# Approach\n\nPlan first.");

		const f2 = await rf(join(outDir, "02-coding.md"), "utf-8");
		expect(f2).toBe("# Coding\n\nEarly returns.");

		const f3 = await rf(join(outDir, "03-testing.md"), "utf-8");
		expect(f3).toBe("# Testing\n\nUse Vitest.");
	});

	it("writes unnumbered files when numbered option is false", async () => {
		const outDir = join(tmpDir, "unnumbered-out");
		const rules = [
			{
				path: "",
				name: "approach",
				description: "Approach rules",
				body: "# Approach\n\nPlan first.",
				rawContent: "# Approach\n\nPlan first.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
			},
		];

		await writeAsDirectory(rules, outDir, "claude", { numbered: false });

		const { readFile: rf } = await import("node:fs/promises");
		const content = await rf(join(outDir, "approach.md"), "utf-8");
		expect(content).toBe("# Approach\n\nPlan first.");
	});

	it("combines numbered prefixes with subdirectories", async () => {
		const outDir = join(tmpDir, "numbered-subdir-out");
		const rules = [
			{
				path: "",
				name: "deploy",
				description: "Deploy rules",
				body: "# Deploy\n\nUse Wrangler.",
				rawContent: "# Deploy\n\nUse Wrangler.",
				source: "claude" as const,
				type: "rule" as const,
				hasPlaceholders: false,
				directory: "infra",
			},
		];

		await writeAsDirectory(rules, outDir, "claude", { numbered: true });

		const { readFile: rf } = await import("node:fs/promises");
		const content = await rf(join(outDir, "infra", "01-deploy.md"), "utf-8");
		expect(content).toBe("# Deploy\n\nUse Wrangler.");
	});
});

describe("extractGlobAnnotation", () => {
	it("extracts glob patterns from callout (single and comma-separated)", () => {
		const r1 = extractGlobAnnotation("## Testing\n\n> [!globs] scripts/**/*.test.ts\n\nContent.");
		expect(r1.globs).toBe("scripts/**/*.test.ts");
		expect(r1.alwaysApply).toBe(false);
		expect(r1.content).toBe("## Testing\n\nContent.");

		const r2 = extractGlobAnnotation("## Rule\n\n> [!globs] src/*.ts, lib/*.ts\n\nContent.");
		expect(r2.globs).toBe("src/*.ts, lib/*.ts");
		expect(r2.alwaysApply).toBe(false);
	});

	it("handles empty callout (scoped, no globs) and no callout (alwaysApply true)", () => {
		const emptyCallout = "## Scoped\n\n> [!globs]\n\nContent.";
		const r1 = extractGlobAnnotation(emptyCallout);
		expect(r1.globs).toBeUndefined();
		expect(r1.alwaysApply).toBe(false);
		expect(r1.content).toBe("## Scoped\n\nContent.");

		const noCallout = "## Global Rule\n\nContent.";
		const r2 = extractGlobAnnotation(noCallout);
		expect(r2.globs).toBeUndefined();
		expect(r2.alwaysApply).toBe(true);
		expect(r2.content).toBe(noCallout);
	});

	it("handles callout at the start of content (no heading)", () => {
		const content = "> [!globs] *.ts\n\nJust content.";
		const result = extractGlobAnnotation(content);
		expect(result.globs).toBe("*.ts");
		expect(result.alwaysApply).toBe(false);
		expect(result.content).toBe("Just content.");
	});
});

describe("extractSectionMetadata", () => {
	it("extracts blockquote description only when no callouts", () => {
		const content = "## Approach\n\n> Plan first, confirm, then implement.\n\nOnly move to Agent mode.";
		const r = extractSectionMetadata(content);
		expect(r.description).toBe("Plan first, confirm, then implement.");
		expect(r.globs).toBeUndefined();
		expect(r.alwaysApply).toBe(true);
		expect(r.content).toBe("## Approach\n\nOnly move to Agent mode.");
	});

	it("extracts [!globs] and [!alwaysApply] false with blockquote description", () => {
		const content =
			"## Tool Registry\n\n> Conventions for the registry.\n\n> [!globs] scripts/shared/formats.ts\n\n> [!alwaysApply] false\n\nContent.";
		const r = extractSectionMetadata(content);
		expect(r.description).toBe("Conventions for the registry.");
		expect(r.globs).toBe("scripts/shared/formats.ts");
		expect(r.alwaysApply).toBe(false);
		expect(r.content).toContain("Content.");
		expect(r.content).not.toContain("[!globs]");
	});

	it("extracts [!alwaysApply] true explicitly", () => {
		const content = "## Global\n\n> [!alwaysApply] true\n\nContent.";
		const r = extractSectionMetadata(content);
		expect(r.alwaysApply).toBe(true);
		expect(r.content).toBe("## Global\n\nContent.");
	});

	it("returns undefined description and alwaysApply true when no metadata", () => {
		const content = "## Section\n\nFirst prose line here.\n\nMore body.";
		const r = extractSectionMetadata(content);
		expect(r.description).toBeUndefined();
		expect(r.globs).toBeUndefined();
		expect(r.alwaysApply).toBe(true);
		expect(r.content).toBe(content);
	});

	it("joins multiple blockquote lines for description and caps at 120 chars", () => {
		const long = "a".repeat(80);
		const content = `## Section\n\n> ${long}\n\n> Second line.\n\nBody.`;
		const r = extractSectionMetadata(content);
		expect(r.description).toBe(`${long} Second line.`.slice(0, 120));
		expect(r.content).toBe("## Section\n\nBody.");
	});

	it("allows metadata in different orders (callouts before blockquote)", () => {
		const content = "## Scoped\n\n> [!globs] *.ts\n\n> [!alwaysApply] false\n\n> One-line summary.\n\nBody.";
		const r = extractSectionMetadata(content);
		expect(r.description).toBe("One-line summary.");
		expect(r.globs).toBe("*.ts");
		expect(r.alwaysApply).toBe(false);
		expect(r.content).toBe("## Scoped\n\nBody.");
	});
});

describe("unquoteGlobs", () => {
	it("removes single and double quotes from glob values", () => {
		expect(unquoteGlobs("---\nglobs: 'scripts/**/*.ts'\n---")).toBe("---\nglobs: scripts/**/*.ts\n---");
		expect(unquoteGlobs('---\nglobs: "scripts/**/*.ts"\n---')).toBe("---\nglobs: scripts/**/*.ts\n---");
	});

	it("leaves content without quoted globs unchanged", () => {
		const unquoted = "---\nglobs: scripts/shared/formats.ts\n---";
		expect(unquoteGlobs(unquoted)).toBe(unquoted);
		const noGlobs = "---\ndescription: A rule\nalwaysApply: true\n---";
		expect(unquoteGlobs(noGlobs)).toBe(noGlobs);
	});
});

describe("readRule glob extraction", () => {
	const tmpDir = join(tmpdir(), "arc-test-readrule-globs");

	beforeAll(async () => {
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("extracts globs from .mdc frontmatter (single and multiple comma-separated)", async () => {
		const scopedPath = join(tmpDir, "scoped.mdc");
		await writeFile(
			scopedPath,
			[
				"---",
				"description: Scoped rule",
				"alwaysApply: false",
				"globs: scripts/**/*.ts",
				"---",
				"",
				"## Scoped Rule",
				"",
				"Content.",
			].join("\n"),
			"utf-8",
		);
		const rule1 = await readRule(scopedPath, "cursor");
		expect(rule1.globs).toBe("scripts/**/*.ts");
		expect(rule1.alwaysApply).toBe(false);

		const multiPath = join(tmpDir, "multi-glob.mdc");
		await writeFile(
			multiPath,
			[
				"---",
				"description: Multi-glob rule",
				"alwaysApply: false",
				"globs: src/*.ts, lib/*.ts",
				"---",
				"",
				"Content.",
			].join("\n"),
			"utf-8",
		);
		const rule2 = await readRule(multiPath, "cursor");
		expect(rule2.globs).toBe("src/*.ts, lib/*.ts");
	});

	it("returns undefined globs for rules without globs", async () => {
		const filePath = join(tmpDir, "no-globs.mdc");
		const content = ["---", "description: Global rule", "alwaysApply: true", "---", "", "Content."].join("\n");
		await writeFile(filePath, content, "utf-8");

		const rule = await readRule(filePath, "cursor");
		expect(rule.globs).toBeUndefined();
		expect(rule.alwaysApply).toBe(true);
	});
});
