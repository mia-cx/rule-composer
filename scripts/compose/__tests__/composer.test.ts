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

	it("adds numbered prefixes when numbered option is true, omits when false", async () => {
		const twoRules = [
			makeRule({ body: "# Approach\n\nPlan first.", rawContent: "# Approach\n\nPlan first." }),
			makeRule({ body: "# Coding\n\nUse returns.", rawContent: "# Coding\n\nUse returns." }),
		];
		const { content: numbered } = await compose(twoRules, "cursor", { numbered: true });
		expect(numbered).toContain("## 1. Approach");
		expect(numbered).toContain("## 2. Coding");

		const oneRule = [makeRule({ body: "# Approach\n\nPlan first.", rawContent: "# Approach\n\nPlan first." })];
		const { content: unnumbered } = await compose(oneRule, "cursor", { numbered: false });
		expect(unnumbered).toContain("## Approach");
		expect(unnumbered).not.toContain("## 1.");
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

	it("normalizes all H2s to sequential numbers by position (strips existing N.), does not touch H3+, leaves content with no headings unchanged", () => {
		const withNumberedAndH3 = "## 1. Approach\n\nContent.\n\n## Testing\n\n### Details\n\nContent.";
		const r1 = addSectionNumbers(withNumberedAndH3);
		expect(r1).toContain("## 1. Approach");
		expect(r1).toContain("## 2. Testing");
		expect(r1).toContain("### Details");
		expect(r1).not.toContain("### 1. Details");

		const noHeadings = "Just plain text.\n\nMore text.";
		expect(addSectionNumbers(noHeadings)).toBe(noHeadings);
	});

	it("renders 99. Rule Name as 5. Rule Name when it is the 5th H2", () => {
		const input = [
			"## One",
			"",
			"## Two",
			"",
			"## Three",
			"",
			"## Four",
			"",
			"## 99. Rule Name",
		].join("\n");
		const result = addSectionNumbers(input);
		expect(result).toContain("## 5. Rule Name");
		expect(result).not.toContain("## 99.");
	});
});

describe("incrementHeadings", () => {
	it("increments H1–H5 by one and leaves H6 unchanged", () => {
		expect(incrementHeadings("# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5")).toBe(
			"## H1\n\n### H2\n\n#### H3\n\n##### H4\n\n###### H5",
		);
		expect(incrementHeadings("###### H6\n\nSome text.")).toBe("###### H6\n\nSome text.");
	});

	it("does not affect non-heading lines, inline hashes, or content with no headings", () => {
		expect(incrementHeadings("Just text.\n\n#not-a-heading\n\nMore text.")).toBe(
			"Just text.\n\n#not-a-heading\n\nMore text.",
		);
		expect(incrementHeadings("Plain text.\n\nMore text.")).toBe("Plain text.\n\nMore text.");
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

	it("leaves body unchanged when not scoped (alwaysApply true or undefined)", () => {
		const body1 = "## Global\n\nContent.";
		expect(injectGlobAnnotation(body1, "*.ts", true)).toBe(body1);
		const body2 = "## Rule\n\nContent.";
		expect(injectGlobAnnotation(body2, undefined, undefined)).toBe(body2);
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
		expect(estimateTokens("hello world")).toBe(countTokens("hello world"));
	});

	it("returns 0 for empty string and positive count for non-empty text", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("line one\nline two\nline three")).toBeGreaterThan(0);
		expect(estimateTokens("  hello   world  ")).toBeGreaterThan(0);
	});
});
