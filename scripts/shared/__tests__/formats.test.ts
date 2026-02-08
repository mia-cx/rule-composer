import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolvePlaceholders,
  readRule,
  writeAsDirectory,
  writeAsSingleFile,
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

  it("cursor config has correct values", () => {
    const cursor = TOOL_REGISTRY.cursor;
    expect(cursor.directories).toContain(".cursor/rules/");
    expect(cursor.extension).toBe(".mdc");
    expect(cursor.hasFrontmatter).toBe(true);
  });

  it("claude config has no frontmatter", () => {
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

  it("cursor has all expected keys", () => {
    const vars = TOOL_VARIABLES.cursor;
    expect(vars["RULES_DIR"]).toBe(".cursor/rules/");
    expect(vars["RULES_EXT"]).toBe(".mdc");
    expect(vars["SKILLS_DIR"]).toBe(".cursor/skills/");
    expect(vars["GLOBAL_RULES"]).toBe("~/.cursor/rules/");
    expect(vars["GLOBAL_SKILLS"]).toBe("~/.cursor/skills/");
  });

  it("claude has empty skills-related vars", () => {
    const vars = TOOL_VARIABLES.claude;
    expect(vars["SKILLS_DIR"]).toBe("");
    expect(vars["SKILLS_EXT"]).toBe("");
    expect(vars["GLOBAL_SKILLS"]).toBe("");
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

  it("keeps unknown placeholders as-is", () => {
    const input = "Unknown: {{DOES_NOT_EXIST}}";
    const result = resolvePlaceholders(input, "cursor");
    expect(result).toBe("Unknown: {{DOES_NOT_EXIST}}");
  });

  it("handles multiple placeholders on the same line", () => {
    const input = "{{RULES_DIR}}*{{RULES_EXT}}";
    const result = resolvePlaceholders(input, "cursor");
    expect(result).toBe(".cursor/rules/*.mdc");
  });

  it("removes line if any placeholder resolves to empty", () => {
    // All empty
    expect(
      resolvePlaceholders(
        "{{SKILLS_DIR}} and {{GLOBAL_SKILLS}} both",
        "copilot",
      ),
    ).toBe("");
    // Mixed: TOOL_NAME is non-empty but SKILLS_DIR is empty → line still removed
    expect(
      resolvePlaceholders("{{TOOL_NAME}} skills: {{SKILLS_DIR}}", "copilot"),
    ).toBe("");
  });

  it("handles content with no placeholders", () => {
    const input = "No placeholders here\nJust plain text";
    const result = resolvePlaceholders(input, "cursor");
    expect(result).toBe(input);
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
    const content = [
      "---",
      "description: Dynamic rule",
      "---",
      "",
      "Use {{RULES_DIR}} for rules.",
    ].join("\n");
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

    const { readFile: rf, access: acc } = await import("node:fs/promises");

    // Rule with directory should be in subdirectory
    const subContent = await rf(
      join(outDir, "testing", "unit-tests.md"),
      "utf-8",
    );
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
    const content = await rf(
      join(outDir, "infrastructure", "deploy", "cloudflare.md"),
      "utf-8",
    );
    expect(content).toBe("# Cloudflare\n\nUse Wrangler.");
  });
});
