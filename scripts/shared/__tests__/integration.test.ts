import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { splitByHeadings } from "../../decompose/splitter.js";
import {
  extractProseDescription,
  buildRawContent,
} from "../../decompose/index.js";
import { reconstructFromHeadings } from "../../decompose/matcher.js";
import { readRule, writeAsDirectory } from "../formats.js";
import { compose, estimateTokens } from "../../compose/composer.js";
import type { RuleFile } from "../types.js";
import type { DecomposeResponse } from "../schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const INPUT_FILE = join(FIXTURES, "input", "AGENTS.md");
const DECOMPOSE_EXPECTED = join(FIXTURES, "decompose-expected");
const COMPOSE_EXPECTED = join(FIXTURES, "compose-expected");

/** Read input fixture */
const getInput = async () => readFile(INPUT_FILE, "utf-8");

/** Read a golden file */
const readGolden = async (dir: string, file: string) =>
  readFile(join(dir, file), "utf-8");

describe("decompose integration", () => {
  const tmpDir = join(tmpdir(), "arc-integration-decompose");

  beforeAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("splits the sample AGENTS.md into the expected sections", async () => {
    const input = await getInput();
    const splits = splitByHeadings(input);

    // 4 H2 sections + 1 preamble = 5
    expect(splits).toHaveLength(5);
    expect(splits.map((s) => s.name)).toEqual([
      "preamble",
      "approach",
      "coding-conventions",
      "technology-preferences",
      "communication",
    ]);
  });

  it("each split contains its own heading", async () => {
    const input = await getInput();
    const splits = splitByHeadings(input);

    expect(splits[1]!.content).toContain("## Approach");
    expect(splits[2]!.content).toContain("## Coding Conventions");
    expect(splits[3]!.content).toContain("## Technology Preferences");
    expect(splits[4]!.content).toContain("## Communication");
  });

  it("extracts prose descriptions for prose sections, empty for table sections", async () => {
    const input = await getInput();
    const splits = splitByHeadings(input);

    // preamble starts with prose
    expect(extractProseDescription(splits[0]!.content)).toContain(
      "These rules define conventions",
    );

    // approach starts with prose
    expect(extractProseDescription(splits[1]!.content)).toContain("Plan first");

    // coding-conventions starts with prose
    expect(extractProseDescription(splits[2]!.content)).toContain(
      "Use consistent patterns",
    );

    // technology-preferences starts with a table
    expect(extractProseDescription(splits[3]!.content)).toBe("");

    // communication starts with prose
    expect(extractProseDescription(splits[4]!.content)).toContain("Be concise");
  });

  it("buildRawContent generates correct frontmatter based on content type", async () => {
    const input = await getInput();
    const splits = splitByHeadings(input);

    // Prose section gets description
    const proseRaw = buildRawContent(splits[1]!.content, "Plan first.", true);
    expect(proseRaw).toContain("alwaysApply: true");
    expect(proseRaw).toContain("description:");

    // Table section omits description
    const tableRaw = buildRawContent(splits[3]!.content, "", true);
    expect(tableRaw).toContain("alwaysApply: true");
    expect(tableRaw).not.toContain("description:");
  });

  it("writeAsDirectory produces files matching golden fixtures", async () => {
    const input = await getInput();
    const splits = splitByHeadings(input);

    const ruleFiles: RuleFile[] = splits.map((split) => {
      const description = extractProseDescription(split.content);
      const rawContent = buildRawContent(split.content, description, true);
      return {
        path: "",
        name: split.name,
        description,
        body: split.content,
        rawContent,
        source: "cursor" as const,
        type: "rule" as const,
        hasPlaceholders: /\{\{\w+\}\}/.test(split.content),
      };
    });

    await writeAsDirectory(ruleFiles, tmpDir, "cursor");

    // Compare each file against golden
    const expectedFiles = (await readdir(DECOMPOSE_EXPECTED)).filter((f) =>
      f.endsWith(".mdc"),
    );

    for (const file of expectedFiles) {
      const actual = await readFile(join(tmpDir, file), "utf-8");
      const expected = await readGolden(DECOMPOSE_EXPECTED, file);
      expect(actual).toBe(expected);
    }
  });
});

describe("compose integration", () => {
  let rules: RuleFile[];

  beforeAll(async () => {
    const files = (await readdir(DECOMPOSE_EXPECTED)).filter((f) =>
      f.endsWith(".mdc"),
    );
    rules = [];
    for (const file of files) {
      const rule = await readRule(join(DECOMPOSE_EXPECTED, file), "cursor");
      rules.push(rule);
    }
  });

  it("compose for cursor matches golden output", async () => {
    const result = compose(rules, "cursor");
    const expected = await readGolden(COMPOSE_EXPECTED, "AGENTS.md");
    expect(result.content).toBe(expected);
  });

  it("compose for claude matches golden output", async () => {
    const result = compose(rules, "claude");
    const expected = await readGolden(COMPOSE_EXPECTED, "claude.md");
    expect(result.content).toBe(expected);
  });

  it("cursor output strips frontmatter and resolves placeholders", () => {
    const result = compose(rules, "cursor");
    expect(result.content.startsWith("---")).toBe(false);
    expect(result.content).toContain(".cursor/rules/");
    expect(result.content).not.toContain("{{RULES_DIR}}");
  });

  it("claude output resolves placeholders and removes empty-value lines", () => {
    const result = compose(rules, "claude");
    expect(result.content).toContain("Claude Code");
    expect(result.content).not.toContain("{{TOOL_NAME}}");
    expect(result.content).not.toContain("{{SKILLS_DIR}}");
    expect(result.content).not.toContain("reusable workflows");
  });

  it("reports placeholder count and reasonable token estimate", () => {
    const result = compose(rules, "cursor");
    expect(result.placeholderCount).toBeGreaterThan(0);

    const tokens = estimateTokens(result.content);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(result.content.length);
  });
});

describe("reconstruct integration", () => {
  it("reconstructs all sections with no unmatched warnings", async () => {
    const input = await getInput();

    const metadata: DecomposeResponse = [
      {
        name: "approach",
        description: "General approach to tasks",
        headings: ["Approach"],
      },
      {
        name: "coding-conventions",
        description: "Code style and patterns",
        headings: ["Coding Conventions"],
      },
      {
        name: "technology-preferences",
        description: "Technology stack choices",
        headings: ["Technology Preferences"],
      },
      {
        name: "communication",
        description: "Communication style guidelines",
        headings: ["Communication"],
      },
    ];

    const { splits, warnings } = reconstructFromHeadings(input, metadata);

    expect(splits).toHaveLength(4);
    const unmatched = warnings.filter((w) => w.type === "unmatched-heading");
    expect(unmatched).toHaveLength(0);
  });

  it("cross-heading grouping merges sections", async () => {
    const input = await getInput();

    const metadata: DecomposeResponse = [
      {
        name: "code-and-style",
        description: "Coding and communication rules",
        headings: ["Coding Conventions", "Communication"],
      },
    ];

    const { splits } = reconstructFromHeadings(input, metadata);

    expect(splits).toHaveLength(1);
    expect(splits[0]!.content).toContain("## Coding Conventions");
    expect(splits[0]!.content).toContain("## Communication");
    expect(splits[0]!.content).toContain("kebab-case");
    expect(splits[0]!.content).toContain("Be concise");
  });

  it("includes preamble via __preamble__", async () => {
    const input = await getInput();

    const metadata: DecomposeResponse = [
      {
        name: "overview",
        description: "Project overview and intro",
        headings: ["__preamble__"],
      },
    ];

    const { splits } = reconstructFromHeadings(input, metadata);

    expect(splits).toHaveLength(1);
    expect(splits[0]!.content).toContain("Sample Project Rules");
  });

  it("warns about unclaimed sections", async () => {
    const input = await getInput();

    // Only claim Approach — everything else is unclaimed
    const metadata: DecomposeResponse = [
      {
        name: "approach",
        description: "General approach to tasks",
        headings: ["Approach"],
      },
    ];

    const { warnings } = reconstructFromHeadings(input, metadata);

    const unclaimed = warnings.filter((w) => w.type === "unclaimed-section");
    expect(unclaimed.length).toBeGreaterThanOrEqual(3);
    expect(unclaimed.map((w) => w.heading)).toContain("Coding Conventions");
    expect(unclaimed.map((w) => w.heading)).toContain("Technology Preferences");
    expect(unclaimed.map((w) => w.heading)).toContain("Communication");
  });

  it("passes directory field through to splits", async () => {
    const input = await getInput();

    const metadata: DecomposeResponse = [
      {
        name: "approach",
        description: "General approach to tasks",
        headings: ["Approach"],
        directory: "core",
      },
    ];

    const { splits } = reconstructFromHeadings(input, metadata);

    expect(splits[0]!.directory).toBe("core");
  });
});
