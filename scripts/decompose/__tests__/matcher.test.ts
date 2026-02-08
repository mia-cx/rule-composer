import { describe, it, expect } from "vitest";
import {
  parseHeadingMap,
  reconstructFromHeadings,
  PREAMBLE_KEY,
} from "../matcher.js";
import type { DecomposeResponse } from "../../shared/schemas.js";

const SAMPLE_DOC = [
  "# My Rules",
  "",
  "Some preamble text here.",
  "",
  "## Approach",
  "",
  "Plan first, confirm, then implement.",
  "",
  "## Coding Conventions",
  "",
  "Use early returns and guard clauses.",
  "",
  "### Naming",
  "",
  "Use kebab-case for files.",
  "",
  "## Testing",
  "",
  "Write tests with Vitest.",
  "",
  "## Communication",
  "",
  "Be concise.",
].join("\n");

describe("parseHeadingMap", () => {
  it("creates a map of heading text to section content", () => {
    const map = parseHeadingMap(SAMPLE_DOC);

    expect(map.has("Approach")).toBe(true);
    expect(map.has("Coding Conventions")).toBe(true);
    expect(map.has("Testing")).toBe(true);
    expect(map.has("Communication")).toBe(true);
  });

  it("captures preamble under __preamble__ key", () => {
    const map = parseHeadingMap(SAMPLE_DOC);

    expect(map.has(PREAMBLE_KEY)).toBe(true);
    expect(map.get(PREAMBLE_KEY)).toContain("Some preamble text here.");
  });

  it("includes H3 subsections with their parent H2", () => {
    const map = parseHeadingMap(SAMPLE_DOC);
    const coding = map.get("Coding Conventions")!;

    expect(coding).toContain("Use early returns");
    expect(coding).toContain("### Naming");
    expect(coding).toContain("kebab-case");
  });

  it("returns empty map for empty input and skips H1-only preamble", () => {
    expect(parseHeadingMap("").size).toBe(0);

    const doc = "# Title\n\n## Section\n\nContent.";
    const map = parseHeadingMap(doc);
    expect(map.has(PREAMBLE_KEY)).toBe(false);
    expect(map.has("Section")).toBe(true);
  });

  it("preserves section content accurately", () => {
    const map = parseHeadingMap(SAMPLE_DOC);

    expect(map.get("Testing")).toBe("## Testing\n\nWrite tests with Vitest.");
    expect(map.get("Communication")).toBe("## Communication\n\nBe concise.");
  });
});

describe("reconstructFromHeadings", () => {
  it("maps a single heading to its section content", () => {
    const rules: DecomposeResponse = [
      {
        name: "approach",
        description: "General approach",
        headings: ["Approach"],
      },
    ];

    const { splits, warnings } = reconstructFromHeadings(SAMPLE_DOC, rules);

    expect(splits).toHaveLength(1);
    expect(splits[0]!.name).toBe("approach");
    expect(splits[0]!.content).toContain("Plan first");
  });

  it("concatenates multiple headings into one rule", () => {
    const rules: DecomposeResponse = [
      {
        name: "coding-and-testing",
        description: "Code and test conventions",
        headings: ["Coding Conventions", "Testing"],
      },
    ];

    const { splits } = reconstructFromHeadings(SAMPLE_DOC, rules);

    expect(splits).toHaveLength(1);
    expect(splits[0]!.content).toContain("early returns");
    expect(splits[0]!.content).toContain("### Naming");
    expect(splits[0]!.content).toContain("Write tests with Vitest");
  });

  it("includes __preamble__ content", () => {
    const rules: DecomposeResponse = [
      {
        name: "overview",
        description: "Project overview",
        headings: [PREAMBLE_KEY],
      },
    ];

    const { splits } = reconstructFromHeadings(SAMPLE_DOC, rules);

    expect(splits).toHaveLength(1);
    expect(splits[0]!.content).toContain("Some preamble text here.");
  });

  it("warns on unmatched heading and skips it", () => {
    const rules: DecomposeResponse = [
      {
        name: "missing",
        description: "References a heading that does not exist",
        headings: ["Nonexistent Heading", "Approach"],
      },
    ];

    const { splits, warnings } = reconstructFromHeadings(SAMPLE_DOC, rules);

    // Still produces a split from the valid heading
    expect(splits).toHaveLength(1);
    expect(splits[0]!.content).toContain("Plan first");

    // Warns about the missing heading
    const unmatched = warnings.filter((w) => w.type === "unmatched-heading");
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.heading).toBe("Nonexistent Heading");
    expect(unmatched[0]!.rule).toBe("missing");
  });

  it("produces no split when all headings are unmatched", () => {
    const rules: DecomposeResponse = [
      {
        name: "ghost",
        description: "References only nonexistent headings",
        headings: ["Does Not Exist"],
      },
    ];

    const { splits, warnings } = reconstructFromHeadings(SAMPLE_DOC, rules);

    expect(splits).toHaveLength(0);
    expect(warnings.some((w) => w.type === "unmatched-heading")).toBe(true);
  });

  it("warns about unclaimed sections", () => {
    // Only claim Approach — Coding Conventions, Testing, Communication, and preamble are unclaimed
    const rules: DecomposeResponse = [
      {
        name: "approach",
        description: "General approach",
        headings: ["Approach"],
      },
    ];

    const { warnings } = reconstructFromHeadings(SAMPLE_DOC, rules);

    const unclaimed = warnings.filter((w) => w.type === "unclaimed-section");
    expect(unclaimed.length).toBeGreaterThanOrEqual(3);
    expect(unclaimed.map((w) => w.heading)).toContain("Coding Conventions");
    expect(unclaimed.map((w) => w.heading)).toContain("Testing");
    expect(unclaimed.map((w) => w.heading)).toContain("Communication");
  });

  it("passes through directory field", () => {
    const rules: DecomposeResponse = [
      {
        name: "approach",
        description: "General approach",
        headings: ["Approach"],
        directory: "core",
      },
    ];

    const { splits } = reconstructFromHeadings(SAMPLE_DOC, rules);

    expect(splits[0]!.directory).toBe("core");
  });

  it("handles multiple rules claiming different headings", () => {
    const rules: DecomposeResponse = [
      {
        name: "approach",
        description: "General approach",
        headings: ["Approach"],
      },
      {
        name: "coding",
        description: "Code conventions",
        headings: ["Coding Conventions"],
      },
      {
        name: "quality",
        description: "Testing and communication",
        headings: ["Testing", "Communication"],
      },
    ];

    const { splits, warnings } = reconstructFromHeadings(SAMPLE_DOC, rules);

    expect(splits).toHaveLength(3);
    expect(splits[0]!.name).toBe("approach");
    expect(splits[1]!.name).toBe("coding");
    expect(splits[2]!.name).toBe("quality");
    expect(splits[2]!.content).toContain("Vitest");
    expect(splits[2]!.content).toContain("Be concise");

    // Only preamble should be unclaimed
    const unclaimed = warnings.filter((w) => w.type === "unclaimed-section");
    expect(unclaimed).toHaveLength(1);
    expect(unclaimed[0]!.heading).toBe(PREAMBLE_KEY);
  });

  it("handles empty rules and preserves AI description", () => {
    // Empty rules => no splits, all unclaimed
    const { splits: emptySplits, warnings } = reconstructFromHeadings(
      SAMPLE_DOC,
      [],
    );
    expect(emptySplits).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((w) => w.type === "unclaimed-section")).toBe(true);

    // Description passthrough
    const { splits } = reconstructFromHeadings(SAMPLE_DOC, [
      {
        name: "approach",
        description: "Custom AI-generated description",
        headings: ["Approach"],
      },
    ]);
    expect(splits[0]!.description).toBe("Custom AI-generated description");
  });
});
