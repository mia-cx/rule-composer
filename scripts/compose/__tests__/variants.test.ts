import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, readFile, mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateVariants } from "../variants.js";

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe("generateVariants", () => {
  const tmpDir = join(tmpdir(), "arc-test-variants");
  const rulesDir = join(tmpDir, "rules");
  const skillsDir = join(tmpDir, "skills");
  const outputDir = join(tmpDir, "coding-tools");

  beforeAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(rulesDir, { recursive: true });
    await mkdir(join(skillsDir, "my-skill"), { recursive: true });

    // Create a static rule
    await writeFile(
      join(rulesDir, "approach.mdc"),
      "---\ndescription: Approach\nalwaysApply: true\n---\n\n# Approach\n\nPlan first.",
      "utf-8",
    );

    // Create a dynamic rule with placeholders
    await writeFile(
      join(rulesDir, "tools.mdc"),
      "---\ndescription: Tool rules for {{TOOL_NAME}}\nalwaysApply: true\n---\n\n# Rules\n\nUse {{RULES_DIR}} for rules.\nUse {{SKILLS_DIR}} for skills.",
      "utf-8",
    );

    // Create a skill
    await writeFile(
      join(skillsDir, "my-skill", "SKILL.md"),
      "# My Skill\n\nDo the thing.",
      "utf-8",
    );
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("generates directories for specified tools", async () => {
    const results = await generateVariants(rulesDir, skillsDir, outputDir, [
      "cursor",
      "claude",
    ], false);

    expect(results).toHaveLength(2);
    expect(results[0]!.toolId).toBe("cursor");
    expect(results[1]!.toolId).toBe("claude");
  });

  it("creates correct files per tool", async () => {
    await generateVariants(rulesDir, skillsDir, outputDir, ["cursor"], false);

    const cursorDir = join(outputDir, "cursor");
    expect(await exists(join(cursorDir, "approach.mdc"))).toBe(true);
    expect(await exists(join(cursorDir, "tools.mdc"))).toBe(true);
    expect(await exists(join(cursorDir, "README.md"))).toBe(true);

    const readme = await readFile(join(cursorDir, "README.md"), "utf-8");
    expect(readme).toContain("Cursor Rules");
    expect(readme).toContain(".cursor/rules/");
  });

  it("resolves placeholders for cursor", async () => {
    await generateVariants(rulesDir, skillsDir, outputDir, ["cursor"], false);

    const content = await readFile(
      join(outputDir, "cursor", "tools.mdc"),
      "utf-8",
    );
    expect(content).toContain(".cursor/rules/");
    expect(content).toContain(".cursor/skills/");
    expect(content).not.toContain("{{RULES_DIR}}");
    // Check frontmatter resolved too
    expect(content).toContain("Tool rules for Cursor");
  });

  it("resolves placeholders for claude and removes empty-var lines", async () => {
    await generateVariants(rulesDir, skillsDir, outputDir, ["claude"], false);

    const content = await readFile(
      join(outputDir, "claude", "tools.md"),
      "utf-8",
    );
    expect(content).toContain(".claude/rules/");
    // Claude has SKILLS_DIR = '' so the skills line should be removed
    expect(content).not.toContain("skills");
    expect(content).not.toContain("{{");
  });

  it("strips frontmatter for tools that do not use it", async () => {
    await generateVariants(rulesDir, skillsDir, outputDir, ["claude"], false);

    const content = await readFile(
      join(outputDir, "claude", "approach.md"),
      "utf-8",
    );
    expect(content).not.toContain("---");
    expect(content).toContain("# Approach");
  });

  it("preserves frontmatter for cursor", async () => {
    await generateVariants(rulesDir, skillsDir, outputDir, ["cursor"], false);

    const content = await readFile(
      join(outputDir, "cursor", "approach.mdc"),
      "utf-8",
    );
    expect(content).toContain("---");
    expect(content).toContain("description:");
    expect(content).toContain("# Approach");
  });

  it("uses correct extensions per tool", async () => {
    await generateVariants(rulesDir, skillsDir, outputDir, [
      "cursor",
      "claude",
      "copilot",
    ], false);

    expect(await exists(join(outputDir, "cursor", "approach.mdc"))).toBe(true);
    expect(await exists(join(outputDir, "claude", "approach.md"))).toBe(true);
    expect(
      await exists(join(outputDir, "copilot", "approach.instructions.md")),
    ).toBe(true);
  });

  it("reports file counts", async () => {
    const results = await generateVariants(rulesDir, skillsDir, outputDir, [
      "cursor",
    ], false);

    // 2 rules + 1 skill = 3 files
    expect(results[0]!.fileCount).toBe(3);
  });

  it("cleans output directory before regenerating", async () => {
    const cursorDir = join(outputDir, "cursor");
    await mkdir(cursorDir, { recursive: true });
    await writeFile(join(cursorDir, "stale.mdc"), "old content", "utf-8");

    await generateVariants(rulesDir, skillsDir, outputDir, ["cursor"], false);
    expect(await exists(join(cursorDir, "stale.mdc"))).toBe(false);
  });
});
