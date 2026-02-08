import { describe, it, expect } from "vitest";
import { compose, estimateTokens } from "../composer.js";
import type { RuleFile } from "../../shared/types.js";

const makeRule = (overrides: Partial<RuleFile> = {}): RuleFile => ({
  path: "/fake/path/rule.mdc",
  name: "test-rule",
  description: "A test rule",
  body: "# Test Rule\n\nSome content.",
  rawContent:
    "---\ndescription: A test rule\n---\n\n# Test Rule\n\nSome content.",
  source: "agents-repo",
  type: "rule",
  hasPlaceholders: false,
  ...overrides,
});

describe("compose", () => {
  it("strips frontmatter and joins rules", () => {
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

    const { content } = compose(rules, "cursor");
    expect(content).toContain("# Rule 1");
    expect(content).toContain("# Rule 2");
    expect(content).not.toContain("---");
  });

  it("counts placeholders before resolution", () => {
    const rules = [
      makeRule({
        body: "Use {{RULES_DIR}} and {{SKILLS_DIR}}.",
        rawContent: "Use {{RULES_DIR}} and {{SKILLS_DIR}}.",
      }),
    ];

    const { placeholderCount } = compose(rules, "cursor");
    expect(placeholderCount).toBe(2);
  });

  it("resolves placeholders for the target tool", () => {
    const rules = [
      makeRule({
        body: "Rules at {{RULES_DIR}}*{{RULES_EXT}}",
        rawContent: "Rules at {{RULES_DIR}}*{{RULES_EXT}}",
        hasPlaceholders: true,
      }),
    ];

    const { content } = compose(rules, "cursor");
    expect(content).toContain(".cursor/rules/*.mdc");
    expect(content).not.toContain("{{");
  });

  it("removes lines with empty-value placeholders", () => {
    const rules = [
      makeRule({
        body: "Rules: {{RULES_DIR}}\nSkills: {{SKILLS_DIR}}\nStatic line",
        rawContent: "Rules: {{RULES_DIR}}\nSkills: {{SKILLS_DIR}}\nStatic line",
        hasPlaceholders: true,
      }),
    ];

    // Claude has empty SKILLS_DIR
    const { content } = compose(rules, "claude");
    expect(content).toContain("Rules: .claude/rules/");
    expect(content).not.toContain("Skills:");
    expect(content).toContain("Static line");
  });

  it("returns empty content for empty selection", () => {
    const { content, placeholderCount } = compose([], "cursor");
    expect(content).toBe("");
    expect(placeholderCount).toBe(0);
  });

  it("separates rules with double newlines", () => {
    const rules = [
      makeRule({ body: "Rule A", rawContent: "Rule A" }),
      makeRule({ body: "Rule B", rawContent: "Rule B" }),
    ];

    const { content } = compose(rules, "cursor");
    expect(content).toBe("Rule A\n\nRule B");
  });
});

describe("estimateTokens", () => {
  it("estimates tokens as words * 1.3 rounded up", () => {
    // "hello world" = 2 words -> ceil(2 * 1.3) = 3
    expect(estimateTokens("hello world")).toBe(3);
  });

  it("handles empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles multiline text and extra whitespace", () => {
    // 6 words -> ceil(6 * 1.3) = 8
    expect(estimateTokens("line one\nline two\nline three")).toBe(8);
    // Extra whitespace: 2 words -> 3
    expect(estimateTokens("  hello   world  ")).toBe(3);
  });
});
