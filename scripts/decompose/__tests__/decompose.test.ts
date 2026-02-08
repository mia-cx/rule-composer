import { describe, it, expect } from "vitest";
import matter from "gray-matter";
import { extractProseDescription, buildRawContent } from "../index.js";

describe("extractProseDescription", () => {
	it("extracts first prose line as description", () => {
		const content = ["## Approach", "", "Plan first, confirm, then implement.", "", "More details here."].join(
			"\n",
		);

		expect(extractProseDescription(content)).toBe("Plan first, confirm, then implement.");
	});

	it("returns empty string when first content is a table or a list (any syntax)", () => {
		const tableContent = [
			"## Technology Preferences",
			"",
			"| Preference | Detail |",
			"| --- | --- |",
			"| Primary | SvelteKit |",
		].join("\n");
		expect(extractProseDescription(tableContent)).toBe("");

		const listCases = [
			["## Items", "", "- First item", "- Second item"],
			["## Items", "", "* First item", "* Second item"],
			["## Items", "", "+ First item"],
			["## Steps", "", "1. First step", "2. Second step"],
		];
		for (const lines of listCases) {
			expect(extractProseDescription(lines.join("\n"))).toBe("");
		}
	});

	it("skips blank lines and headings to find prose", () => {
		const content = ["## Section", "", "", "### Subsection", "", "Actual prose here."].join("\n");

		expect(extractProseDescription(content)).toBe("Actual prose here.");
	});

	it("truncates long descriptions to 120 characters", () => {
		const longLine = "A".repeat(200);
		const content = `## Section\n\n${longLine}`;

		expect(extractProseDescription(content)).toHaveLength(120);
	});

	it("returns empty string for heading-only content and empty input", () => {
		expect(extractProseDescription("## Section\n\n### Subsection")).toBe("");
		expect(extractProseDescription("")).toBe("");
	});

	it("handles content with no heading prefix and trims whitespace from extracted line", () => {
		expect(extractProseDescription("Just some prose without any heading.")).toBe(
			"Just some prose without any heading.",
		);
		expect(extractProseDescription("## Section\n\n   Indented prose.  ")).toBe("Indented prose.");
	});
});

describe("buildRawContent", () => {
	it("adds frontmatter with description and alwaysApply when hasFrontmatter is true", () => {
		const body = "## Approach\n\nPlan first.";
		const result = buildRawContent(body, "Plan first.", true);

		const parsed = matter(result);
		expect(parsed.data["alwaysApply"]).toBe(true);
		expect(parsed.data["description"]).toBe("Plan first.");
		expect(parsed.content.trim()).toBe(body);
		expect(result).toMatch(/---\r?\n\r?\n#/m);
	});

	it("omits description from frontmatter when empty", () => {
		const body = "## Tech\n\n| Col | Val |";
		const result = buildRawContent(body, "", true);

		const parsed = matter(result);
		expect(parsed.data["alwaysApply"]).toBe(true);
		expect(parsed.data).not.toHaveProperty("description");
		expect(parsed.content.trim()).toBe(body);
	});

	it("returns plain body unchanged when hasFrontmatter is false", () => {
		const body1 = "## Approach\n\nPlan first.";
		expect(buildRawContent(body1, "Plan first.", false)).toBe(body1);
		expect(buildRawContent(body1, "Plan first.", false)).not.toContain("---");

		const body2 = "## Tech\n\n| Col | Val |";
		expect(buildRawContent(body2, "", false)).toBe(body2);
	});

	it("produces valid frontmatter that gray-matter can round-trip", () => {
		const body = "# Rule\n\nContent with **bold** and `code`.";
		const description = "Content with bold and code.";
		const result = buildRawContent(body, description, true);

		// Parse and re-stringify should be stable
		const parsed = matter(result);
		const roundTripped = matter(matter.stringify(parsed.content, parsed.data));

		expect(roundTripped.data["alwaysApply"]).toBe(true);
		expect(roundTripped.data["description"]).toBe(description);
	});

	it("preserves multiline body content through frontmatter wrapping", () => {
		const body = [
			"## Conventions",
			"",
			"Use early returns.",
			"",
			"### Naming",
			"",
			"Use kebab-case for files.",
		].join("\n");

		const result = buildRawContent(body, "Use early returns.", true);
		const parsed = matter(result);

		expect(parsed.content.trim()).toBe(body);
		expect(parsed.content).toContain("### Naming");
		expect(parsed.content).toContain("kebab-case");
	});

	it("includes globs in frontmatter when provided", () => {
		const body = "## Scoped\n\nContent.";
		const result = buildRawContent(body, "Content.", true, {
			globs: "scripts/**/*.ts",
			alwaysApply: false,
		});

		const parsed = matter(result);
		expect(parsed.data["alwaysApply"]).toBe(false);
		expect(parsed.data["globs"]).toBe("scripts/**/*.ts");
		expect(parsed.data["description"]).toBe("Content.");
	});

	it("frontmatter options and defaults: alwaysApply from options, default true when omitted, omits globs when not provided", () => {
		const body = "## Rule\n\nContent.";
		const withFalse = buildRawContent(body, "", true, { alwaysApply: false });
		expect(matter(withFalse).data["alwaysApply"]).toBe(false);

		const noOptions = buildRawContent(body, "", true);
		expect(matter(noOptions).data["alwaysApply"]).toBe(true);

		const noGlobs = buildRawContent(body, "", true, { alwaysApply: true });
		expect(matter(noGlobs).data).not.toHaveProperty("globs");
	});
});
