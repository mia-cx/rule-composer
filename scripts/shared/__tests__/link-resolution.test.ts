import { describe, it, expect } from "vitest";
import { resolveRelativeToHash, resolveHashToRelative } from "../link-resolution.js";

describe("resolveRelativeToHash", () => {
	it("resolves relative rule links to hash anchors when target is in section map", () => {
		const sectionMap = new Map<string, number>([
			["01-approach", 1],
			["06-rules-and-skills", 6],
		]);

		const input = "See [Rules and Skills](./06-rules-and-skills.mdc) for details.";
		const result = resolveRelativeToHash(input, sectionMap);
		expect(result).toBe("See [Rules and Skills](#6-rules-and-skills) for details.");
	});

	it("supports links without ./ prefix and leaves unchanged when not in map", () => {
		const sectionMap = new Map<string, number>([["06-rules-and-skills", 6]]);

		const input = "[Coding Conventions](08-coding-conventions.mdc)";
		const result = resolveRelativeToHash(input, sectionMap);
		// 08-coding-conventions not in map — unchanged
		expect(result).toBe("[Coding Conventions](08-coding-conventions.mdc)");
	});

	it("leaves links unchanged when target is not in section map", () => {
		const sectionMap = new Map<string, number>([["01-approach", 1]]);

		const input = "See [Rules](./06-rules-and-skills.mdc).";
		const result = resolveRelativeToHash(input, sectionMap);
		expect(result).toBe("See [Rules](./06-rules-and-skills.mdc).");
	});

	it("handles .md extension", () => {
		const sectionMap = new Map<string, number>([["02-conventions", 2]]);

		const input = "[Conventions](./02-conventions.md)";
		const result = resolveRelativeToHash(input, sectionMap);
		expect(result).toBe("[Conventions](#2-conventions)");
	});

	it("leaves non-rule links (external URLs, non-NN-slug) unchanged", () => {
		const sectionMap = new Map<string, number>([["06-rules-and-skills", 6]]);

		const input = "Check [docs](https://example.com) and [other](./other-file.mdc).";
		const result = resolveRelativeToHash(input, sectionMap);
		expect(result).toBe("Check [docs](https://example.com) and [other](./other-file.mdc).");
	});
});

describe("resolveHashToRelative", () => {
	it("resolves hash links to relative filenames when section is in map", () => {
		const sectionMap = new Map<number, string>([
			[1, "01-approach.mdc"],
			[6, "06-rules-and-skills.mdc"],
		]);

		const input = "See [Rules and Skills](#6-rules-and-skills) for details.";
		const result = resolveHashToRelative(input, sectionMap);
		expect(result).toBe("See [Rules and Skills](./06-rules-and-skills.mdc) for details.");
	});

	it("handles hash links with N. Title format", () => {
		const sectionMap = new Map<number, string>([[6, "06-rules-and-skills.mdc"]]);

		const input = "See [Rules](#6. Rules and Skills) for details.";
		const result = resolveHashToRelative(input, sectionMap);
		expect(result).toBe("See [Rules](./06-rules-and-skills.mdc) for details.");
	});

	it("leaves hash links unchanged when section is not in map", () => {
		const sectionMap = new Map<number, string>([[1, "01-approach.mdc"]]);

		const input = "See [Rules](#99-rules-and-skills).";
		const result = resolveHashToRelative(input, sectionMap);
		expect(result).toBe("See [Rules](#99-rules-and-skills).");
	});

	it("handles multiple links in same content", () => {
		const sectionMap = new Map<number, string>([
			[1, "01-approach.mdc"],
			[2, "02-conventions.mdc"],
		]);

		const input = "See [Approach](#1-approach) and [Conventions](#2-conventions).";
		const result = resolveHashToRelative(input, sectionMap);
		expect(result).toBe("See [Approach](./01-approach.mdc) and [Conventions](./02-conventions.mdc).");
	});
});
