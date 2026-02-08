import { describe, it, expect } from "vitest";
import { countTokens } from "gpt-tokenizer";
import { compose, estimateTokens, addSectionNumbers, incrementHeadings, injectGlobAnnotation } from "../composer.js";
import type { RuleFile } from "../../shared/types.js";

const makeRule = (overrides: Partial<RuleFile> = {}): RuleFile => ({
	path: "/fake/path/rule.mdc",
	name: "test-rule",
	description: "A test rule",
	body: "# Test Rule\n\nSome content.",
	rawContent: "---\ndescription: A test rule\n---\n\n# Test Rule\n\nSome content.",
	source: "agents-repo",
	type: "rule",
	hasPlaceholders: false,
	...overrides,
});

describe("compose", () => {
	it("strips frontmatter and joins rules with incremented headings", async () => {
		const rules = [
			makeRule({
				body: "# Rule 1\n\nContent 1.",
				rawContent: "---\ndescription: Rule 1\n---\n\n# Rule 1\n\nContent 1.",
			}),
			makeRule({
				body: "# Rule 2\n\nContent 2.",
				rawContent: "---\ndescription: Rule 2\n---\n\n# Rule 2\n\nContent 2.",
			}),
		];

		const { content } = await compose(rules, "cursor");
		expect(content).toContain("## Rule 1");
		expect(content).toContain("## Rule 2");
		// No bare H1s — only H2s
		expect(content).not.toMatch(/^# /m);
		expect(content).not.toContain("---");
	});

	it("counts placeholders before resolution", async () => {
		const rules = [
			makeRule({
				body: "Use {{RULES_DIR}} and {{SKILLS_DIR}}.",
				rawContent: "Use {{RULES_DIR}} and {{SKILLS_DIR}}.",
			}),
		];

		const { placeholderCount } = await compose(rules, "cursor");
		expect(placeholderCount).toBe(2);
	});

	it("resolves placeholders for the target tool", async () => {
		const rules = [
			makeRule({
				body: "Rules at {{RULES_DIR}}*{{RULES_EXT}}",
				rawContent: "Rules at {{RULES_DIR}}*{{RULES_EXT}}",
				hasPlaceholders: true,
			}),
		];

		const { content } = await compose(rules, "cursor");
		expect(content).toContain(".cursor/rules/");
		expect(content).toContain(".mdc");
		expect(content).not.toContain("{{");
	});

	it("removes lines with empty-value placeholders", async () => {
		const rules = [
			makeRule({
				body: "Rules: {{RULES_DIR}}\nSkills: {{SKILLS_DIR}}\nStatic line",
				rawContent: "Rules: {{RULES_DIR}}\nSkills: {{SKILLS_DIR}}\nStatic line",
				hasPlaceholders: true,
			}),
		];

		// Claude has empty SKILLS_DIR
		const { content } = await compose(rules, "claude");
		expect(content).toContain("Rules: .claude/rules/");
		expect(content).not.toContain("Skills:");
		expect(content).toContain("Static line");
	});

	it("returns empty content for empty selection", async () => {
		const { content, placeholderCount } = await compose([], "cursor");
		expect(content).toBe("");
		expect(placeholderCount).toBe(0);
	});

	it("separates rules with double newlines", async () => {
		const rules = [
			makeRule({ body: "Rule A", rawContent: "Rule A" }),
			makeRule({ body: "Rule B", rawContent: "Rule B" }),
		];

		const { content } = await compose(rules, "cursor");
		expect(content).toBe("Rule A\n\nRule B\n");
	});

	it("adds numbered prefixes when numbered option is true", async () => {
		const rules = [
			makeRule({
				body: "# Approach\n\nPlan first.",
				rawContent: "# Approach\n\nPlan first.",
			}),
			makeRule({
				body: "# Coding\n\nUse returns.",
				rawContent: "# Coding\n\nUse returns.",
			}),
		];

		// H1 → H2 (via increment) → numbered
		const { content } = await compose(rules, "cursor", { numbered: true });
		expect(content).toContain("## 1. Approach");
		expect(content).toContain("## 2. Coding");
	});

	it("does not add numbers when numbered option is false", async () => {
		const rules = [
			makeRule({
				body: "# Approach\n\nPlan first.",
				rawContent: "# Approach\n\nPlan first.",
			}),
		];

		const { content } = await compose(rules, "cursor", { numbered: false });
		expect(content).toContain("## Approach");
		expect(content).not.toContain("## 1.");
	});

	it("skips heading increment when incrementHeadings is false", async () => {
		const rules = [
			makeRule({
				body: "# Rule 1\n\n## Sub",
				rawContent: "# Rule 1\n\n## Sub",
			}),
		];

		const { content } = await compose(rules, "cursor", {
			incrementHeadings: false,
		});
		expect(content).toContain("# Rule 1");
		expect(content).toContain("## Sub");
	});
});

describe("addSectionNumbers", () => {
	it("adds sequential numbers to H2 headings", () => {
		const input = "## Approach\n\nContent.\n\n## Coding\n\nMore content.";
		const result = addSectionNumbers(input);
		expect(result).toContain("## 1. Approach");
		expect(result).toContain("## 2. Coding");
	});

	it("skips already-numbered headings", () => {
		const input = "## 1. Approach\n\nContent.\n\n## Testing\n\nMore.";
		const result = addSectionNumbers(input);
		expect(result).toContain("## 1. Approach");
		expect(result).toContain("## 1. Testing");
	});

	it("does not touch H3+ headings", () => {
		const input = "## Approach\n\n### Details\n\nContent.";
		const result = addSectionNumbers(input);
		expect(result).toContain("## 1. Approach");
		expect(result).toContain("### Details");
		expect(result).not.toContain("### 1. Details");
	});

	it("handles content with no headings", () => {
		const input = "Just plain text.\n\nMore text.";
		expect(addSectionNumbers(input)).toBe(input);
	});
});

describe("incrementHeadings", () => {
	it("increments all heading levels by one", () => {
		const input = "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5";
		const result = incrementHeadings(input);
		expect(result).toBe("## H1\n\n### H2\n\n#### H3\n\n##### H4\n\n###### H5");
	});

	it("leaves H6 headings unchanged (cannot exceed H6)", () => {
		const input = "###### H6\n\nSome text.";
		expect(incrementHeadings(input)).toBe(input);
	});

	it("does not affect non-heading lines or inline hashes", () => {
		const input = "Just text.\n\n#not-a-heading\n\nMore text.";
		expect(incrementHeadings(input)).toBe(input);
	});

	it("handles content with no headings", () => {
		const input = "Plain text.\n\nMore text.";
		expect(incrementHeadings(input)).toBe(input);
	});
});

describe("injectGlobAnnotation", () => {
	it("injects callout after first heading for scoped rules with globs", () => {
		const body = "## Testing\n\nContent here.";
		const result = injectGlobAnnotation(body, "scripts/**/*.test.ts", false);
		expect(result).toBe("## Testing\n\n> [!globs] scripts/**/*.test.ts\n\nContent here.");
	});

	it("injects empty callout for scoped rules without globs", () => {
		const body = "## Scoped\n\nContent.";
		const result = injectGlobAnnotation(body, undefined, false);
		expect(result).toBe("## Scoped\n\n> [!globs]\n\nContent.");
	});

	it("returns body unchanged when alwaysApply is true", () => {
		const body = "## Global\n\nContent.";
		expect(injectGlobAnnotation(body, "*.ts", true)).toBe(body);
	});

	it("returns body unchanged when alwaysApply is undefined", () => {
		const body = "## Rule\n\nContent.";
		expect(injectGlobAnnotation(body, undefined, undefined)).toBe(body);
	});

	it("prepends callout when no heading is found", () => {
		const body = "Just content, no heading.";
		const result = injectGlobAnnotation(body, "*.ts", false);
		expect(result).toBe("> [!globs] *.ts\n\nJust content, no heading.");
	});

	it("handles multiple globs (comma-separated)", () => {
		const body = "## Rule\n\nContent.";
		const result = injectGlobAnnotation(body, "scripts/shared/formats.ts, scripts/decompose/index.ts", false);
		expect(result).toContain("> [!globs] scripts/shared/formats.ts, scripts/decompose/index.ts");
	});
});

describe("compose glob embedding", () => {
	it("embeds glob annotations for scoped rules", async () => {
		const rules = [
			makeRule({
				body: "## Global Rule\n\nContent.",
				rawContent: "## Global Rule\n\nContent.",
				alwaysApply: true,
			}),
			makeRule({
				body: "## Scoped Rule\n\nContent.",
				rawContent: "## Scoped Rule\n\nContent.",
				alwaysApply: false,
				globs: "scripts/**/*.ts",
			}),
		];

		const { content } = await compose(rules, "cursor");
		// Global rule gets no annotation
		expect(content).not.toMatch(/\[!globs\] scripts\/\*.*\n\nContent\.\n\n### Global/);
		// Scoped rule gets annotation (heading incremented: ## → ###). Prettier may escape * in output.
		expect(content).toContain("> [!globs] scripts/");
		expect(content).toContain(".ts");
	});

	it("skips glob embedding when embedGlobs is false", async () => {
		const rules = [
			makeRule({
				body: "## Scoped\n\nContent.",
				rawContent: "## Scoped\n\nContent.",
				alwaysApply: false,
				globs: "*.ts",
			}),
		];

		const { content } = await compose(rules, "cursor", { embedGlobs: false });
		expect(content).not.toContain("[!globs]");
	});
});

describe("estimateTokens", () => {
	it("returns OpenAI-style token count via gpt-tokenizer", () => {
		const text = "hello world";
		expect(estimateTokens(text)).toBe(countTokens(text));
	});

	it("handles empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	it("returns positive count for non-empty text", () => {
		expect(estimateTokens("line one\nline two\nline three")).toBeGreaterThan(0);
		expect(estimateTokens("  hello   world  ")).toBeGreaterThan(0);
	});
});
