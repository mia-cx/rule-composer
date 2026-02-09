import { describe, it, expect } from "vitest";
import {
	openRouterResponseSchema,
	optimizedOutputSchema,
	ruleFrontmatterSchema,
	decomposeResponseSchema,
} from "../schemas.js";

describe("openRouterResponseSchema", () => {
	it("accepts valid response (with or without usage)", () => {
		expect(
			openRouterResponseSchema.safeParse({
				id: "gen-123",
				choices: [{ message: { content: "Hello world" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
			}).success,
		).toBe(true);
		expect(
			openRouterResponseSchema.safeParse({
				id: "gen-123",
				choices: [{ message: { content: "Hello" }, finish_reason: null }],
			}).success,
		).toBe(true);
	});

	it("rejects invalid response (missing id or message content)", () => {
		expect(
			openRouterResponseSchema.safeParse({
				choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
			}).success,
		).toBe(false);
		expect(
			openRouterResponseSchema.safeParse({
				id: "gen-123",
				choices: [{ message: {}, finish_reason: "stop" }],
			}).success,
		).toBe(false);
	});
});

describe("optimizedOutputSchema", () => {
	it("accepts valid markdown with headings", () => {
		const valid =
			"# My Rules\n\n## Approach\n\nPlan first. This is long enough to pass the minimum length requirement.";
		expect(optimizedOutputSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects invalid output (too short, no headings, JSON-like)", () => {
		expect(optimizedOutputSchema.safeParse("# Short").success).toBe(false);
		expect(
			optimizedOutputSchema.safeParse(
				"This is a long enough string but it has no markdown headings at all in the entire content.",
			).success,
		).toBe(false);
		expect(
			optimizedOutputSchema.safeParse('# Rules\n\n```json\n{"key": "value"}\n```\nThis is long enough to pass.')
				.success,
		).toBe(false);
	});
});

describe("ruleFrontmatterSchema", () => {
	it("accepts valid frontmatter and empty object", () => {
		expect(ruleFrontmatterSchema.safeParse({ description: "My rule", alwaysApply: true }).success).toBe(true);
		expect(ruleFrontmatterSchema.safeParse({}).success).toBe(true);
	});

	it("accepts frontmatter with globs as string or array", () => {
		expect(ruleFrontmatterSchema.safeParse({ description: "File pattern", globs: "**/*.ts" }).success).toBe(true);
		expect(
			ruleFrontmatterSchema.safeParse({ description: "Multiple patterns", globs: ["**/*.ts", "**/*.tsx"] })
				.success,
		).toBe(true);
	});

	it("rejects alwaysApply as string", () => {
		const invalid = { alwaysApply: "yes" };
		const result = ruleFrontmatterSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});
});

describe("decomposeResponseSchema", () => {
	it("accepts valid decompose response with headings", () => {
		const valid = [
			{
				name: "coding-conventions",
				description: "Code style and naming conventions",
				headings: ["Coding Conventions"],
			},
			{
				name: "testing-strategy",
				description: "Testing approach and tools",
				headings: ["Testing"],
			},
		];
		const result = decomposeResponseSchema.safeParse(valid);
		expect(result.success).toBe(true);
	});

	it("accepts multiple headings in one rule", () => {
		const valid = [
			{
				name: "technology",
				description: "Technology stack and tooling",
				headings: ["Technology Preferences", "Tooling", "Backend & Data"],
			},
		];
		const result = decomposeResponseSchema.safeParse(valid);
		expect(result.success).toBe(true);
	});

	it("accepts __preamble__ as a heading", () => {
		const valid = [
			{
				name: "overview",
				description: "Project overview and preamble",
				headings: ["__preamble__"],
			},
		];
		const result = decomposeResponseSchema.safeParse(valid);
		expect(result.success).toBe(true);
	});

	it("rejects empty headings array", () => {
		const invalid = [
			{
				name: "coding",
				description: "Code style rules",
				headings: [],
			},
		];
		const result = decomposeResponseSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});

	it("rejects invalid names and short descriptions", () => {
		// Non-kebab-case
		expect(
			decomposeResponseSchema.safeParse([
				{
					name: "CodingConventions",
					description: "Code style",
					headings: ["Coding"],
				},
			]).success,
		).toBe(false);

		// Underscores
		expect(
			decomposeResponseSchema.safeParse([
				{
					name: "coding_conventions",
					description: "Code style",
					headings: ["Coding"],
				},
			]).success,
		).toBe(false);

		// Short description
		expect(
			decomposeResponseSchema.safeParse([{ name: "coding", description: "Hi", headings: ["Coding"] }]).success,
		).toBe(false);
	});

	it("accepts empty array", () => {
		const result = decomposeResponseSchema.safeParse([]);
		expect(result.success).toBe(true);
	});

	it("accepts directory field (flat, nested) and omits it (defaults undefined)", () => {
		const withDir = decomposeResponseSchema.safeParse([
			{
				name: "unit-tests",
				description: "Unit testing conventions",
				headings: ["Unit Tests"],
				directory: "testing",
			},
		]);
		expect(withDir.success).toBe(true);

		const nested = decomposeResponseSchema.safeParse([
			{
				name: "cloudflare",
				description: "Cloudflare deployment rules",
				headings: ["Cloudflare"],
				directory: "infrastructure/deploy",
			},
		]);
		expect(nested.success).toBe(true);

		const noDir = decomposeResponseSchema.safeParse([
			{ name: "approach", description: "General approach rules", headings: ["Approach"] },
		]);
		expect(noDir.success).toBe(true);
		if (noDir.success) {
			expect(noDir.data[0]!.directory).toBeUndefined();
		}
	});

	it("rejects invalid directory values", () => {
		const base = {
			name: "test",
			description: "Test rules",
			headings: ["Test"],
		};

		// Uppercase
		expect(decomposeResponseSchema.safeParse([{ ...base, directory: "Testing" }]).success).toBe(false);
		// Underscores
		expect(decomposeResponseSchema.safeParse([{ ...base, directory: "my_tests" }]).success).toBe(false);
		// Trailing slash
		expect(decomposeResponseSchema.safeParse([{ ...base, directory: "testing/" }]).success).toBe(false);
	});

	it("rejects response missing headings field", () => {
		const invalid = [
			{
				name: "coding",
				description: "Code style rules",
				content: "## Coding\n\nRules here.",
			},
		];
		const result = decomposeResponseSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});
});
