import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { getToolsWithGlobalPaths, expandTilde } from "../index.js";

describe("sync", () => {
	describe("getToolsWithGlobalPaths", () => {
		it("returns only tools that have GLOBAL_RULES or GLOBAL_SKILLS set", () => {
			const tools = getToolsWithGlobalPaths();
			expect(tools).toContain("cursor");
			expect(tools).toContain("claude");
			expect(tools.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("expandTilde", () => {
		it("expands ~/ to home directory", () => {
			expect(expandTilde("~/foo")).toBe(join(homedir(), "foo"));
			const expanded = expandTilde("~/.cursor/rules/");
			expect(expanded.startsWith(homedir())).toBe(true);
			expect(expanded).toContain(".cursor");
		});

		it("leaves paths that do not start with ~/ unchanged", () => {
			expect(expandTilde("/absolute/path")).toBe("/absolute/path");
			expect(expandTilde("relative")).toBe("relative");
		});
	});
});
