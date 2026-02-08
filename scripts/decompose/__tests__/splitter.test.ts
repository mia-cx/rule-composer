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
		expect(splitByHeadings("## My Complex Heading Name\n\nContent.")[0]!.name).toBe("my-complex-heading-name");
		expect(splitByHeadings("## Testing & Verification (v2)\n\nContent.")[0]!.name).toBe("testing-verification-v2");
	});

	it("extracts description from first non-heading line", () => {
		const markdown = ["## Approach", "", "Plan first, confirm, then implement.", "", "More details here."].join(
			"\n",
		);

		const sections = splitByHeadings(markdown);
		expect(sections[0]!.description).toBe("Plan first, confirm, then implement.");
	});

	it("captures meaningful preamble as a section", () => {
		const markdown = ["Some important preamble text.", "", "## Section One", "", "Content."].join("\n");

		const sections = splitByHeadings(markdown);
		expect(sections).toHaveLength(2);
		expect(sections[0]!.name).toBe("preamble");
		expect(sections[0]!.content).toContain("important preamble");
	});

	it("ignores H1-only preamble", () => {
		const markdown = ["# Main Title", "", "## Section One", "", "Content."].join("\n");

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
		const markdown = ["## First", "## Second", "", "Content for second."].join("\n");

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

	it("strips numbered prefixes from filenames and content when present, leaves unnumbered headings unchanged", () => {
		const numbered = [
			"## 1. Approach",
			"",
			"Plan first.",
			"",
			"## 2. Coding Conventions",
			"",
			"Use early returns.",
		].join("\n");
		const sections1 = splitByHeadings(numbered);
		expect(sections1).toHaveLength(2);
		expect(sections1[0]!.name).toBe("approach");
		expect(sections1[1]!.name).toBe("coding-conventions");

		const contentNumbered = ["## 3. Testing & Verification", "", "Write tests."].join("\n");
		const sections2 = splitByHeadings(contentNumbered);
		expect(sections2[0]!.content).toContain("## Testing & Verification");
		expect(sections2[0]!.content).not.toContain("## 3.");

		const unnumbered = ["## Approach", "", "Content."].join("\n");
		const sections3 = splitByHeadings(unnumbered);
		expect(sections3[0]!.name).toBe("approach");
		expect(sections3[0]!.content).toContain("## Approach");
	});
});

describe("stripHeadingNumber", () => {
	it.each([
		["1. Approach", "Approach"],
		["12. Coding Conventions", "Coding Conventions"],
		["Approach", "Approach"],
		["100 Tips", "100 Tips"],
		["03. Testing", "Testing"],
	])("strips N. prefix when present, leaves rest unchanged (%s → %s)", (input, expected) => {
		expect(stripHeadingNumber(input)).toBe(expected);
	});
});
