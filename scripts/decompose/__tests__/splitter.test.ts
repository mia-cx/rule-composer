import { describe, it, expect } from "vitest";
import { splitByHeadings, stripHeadingNumber } from "../splitter.js";

describe("splitByHeadings", () => {
  it("splits on H2 boundaries", () => {
    const markdown = [
      "## Approach",
      "",
      "Plan first, then implement.",
      "",
      "## Coding",
      "",
      "Use early returns.",
    ].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("approach");
    expect(sections[0]!.content).toContain("Plan first");
    expect(sections[1]!.name).toBe("coding");
    expect(sections[1]!.content).toContain("early returns");
  });

  it("keeps H3 subsections with their parent H2", () => {
    const markdown = [
      "## Testing",
      "",
      "Write tests.",
      "",
      "### Unit Tests",
      "",
      "Use Vitest.",
      "",
      "### E2E Tests",
      "",
      "Use Playwright.",
    ].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.name).toBe("testing");
    expect(sections[0]!.content).toContain("### Unit Tests");
    expect(sections[0]!.content).toContain("### E2E Tests");
    expect(sections[0]!.content).toContain("Use Playwright.");
  });

  it("converts heading text to kebab-case, stripping special characters", () => {
    expect(
      splitByHeadings("## My Complex Heading Name\n\nContent.")[0]!.name,
    ).toBe("my-complex-heading-name");
    expect(
      splitByHeadings("## Testing & Verification (v2)\n\nContent.")[0]!.name,
    ).toBe("testing-verification-v2");
  });

  it("extracts description from first non-heading line", () => {
    const markdown = [
      "## Approach",
      "",
      "Plan first, confirm, then implement.",
      "",
      "More details here.",
    ].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections[0]!.description).toBe(
      "Plan first, confirm, then implement.",
    );
  });

  it("captures meaningful preamble as a section", () => {
    const markdown = [
      "Some important preamble text.",
      "",
      "## Section One",
      "",
      "Content.",
    ].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("preamble");
    expect(sections[0]!.content).toContain("important preamble");
  });

  it("ignores H1-only preamble", () => {
    const markdown = [
      "# Main Title",
      "",
      "## Section One",
      "",
      "Content.",
    ].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.name).toBe("section-one");
  });

  it("handles empty input and input with no H2 headings", () => {
    expect(splitByHeadings("")).toHaveLength(0);

    // No H2 boundaries → preamble is flushed as a single section
    const sections = splitByHeadings("# Just an H1\n\nSome text.");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.name).toBe("preamble");
  });

  it("handles multiple consecutive H2s", () => {
    const markdown = ["## First", "## Second", "", "Content for second."].join(
      "\n",
    );

    const sections = splitByHeadings(markdown);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("first");
    expect(sections[0]!.content).toBe("## First");
    expect(sections[1]!.name).toBe("second");
  });

  it("trims whitespace from section content", () => {
    const markdown = ["## Approach", "", "Content here.", "", ""].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections[0]!.content).not.toMatch(/\n\n$/);
  });

  it("strips numbered prefixes from H2 headings in filenames", () => {
    const markdown = [
      "## 1. Approach",
      "",
      "Plan first.",
      "",
      "## 2. Coding Conventions",
      "",
      "Use early returns.",
    ].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("approach");
    expect(sections[1]!.name).toBe("coding-conventions");
  });

  it("strips numbered prefixes from content headings", () => {
    const markdown = [
      "## 3. Testing & Verification",
      "",
      "Write tests.",
    ].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections[0]!.content).toContain("## Testing & Verification");
    expect(sections[0]!.content).not.toContain("## 3.");
  });

  it("handles headings that are not numbered (no-op)", () => {
    const markdown = ["## Approach", "", "Content."].join("\n");

    const sections = splitByHeadings(markdown);
    expect(sections[0]!.name).toBe("approach");
    expect(sections[0]!.content).toContain("## Approach");
  });
});

describe("stripHeadingNumber", () => {
  it("strips single-digit prefix", () => {
    expect(stripHeadingNumber("1. Approach")).toBe("Approach");
  });

  it("strips multi-digit prefix", () => {
    expect(stripHeadingNumber("12. Coding Conventions")).toBe(
      "Coding Conventions",
    );
  });

  it("returns unchanged text when no prefix", () => {
    expect(stripHeadingNumber("Approach")).toBe("Approach");
  });

  it("does not strip numbers that are not followed by a dot and space", () => {
    expect(stripHeadingNumber("100 Tips")).toBe("100 Tips");
  });

  it("strips zero-padded prefix", () => {
    expect(stripHeadingNumber("03. Testing")).toBe("Testing");
  });
});
