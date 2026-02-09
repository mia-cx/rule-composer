import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
	getToolsWithGlobalPaths,
	expandTilde,
	buildSyncCategoryList,
	buildSyncSourceTree,
	findSyncSourceDirs,
	getCanonicalSyncRepoPaths,
	getToolSyncRepoPaths,
	hasCanonicalSyncLayout,
} from "../index.js";
import { TOOL_VARIABLES } from "../../shared/formats.js";

const syncTestRoot = join(tmpdir(), "arc-test-sync-layout");

describe("sync", () => {
	describe("getToolsWithGlobalPaths", () => {
		it("returns only tools that have GLOBAL_RULES, GLOBAL_SKILLS, GLOBAL_AGENTS, or GLOBAL_COMMANDS set", () => {
			const tools = getToolsWithGlobalPaths();
			expect(tools).toContain("cursor");
			expect(tools).toContain("claude");
			expect(tools.length).toBeGreaterThanOrEqual(2);
		});

		it("cursor has GLOBAL_AGENTS and GLOBAL_COMMANDS set", () => {
			expect(TOOL_VARIABLES.cursor.GLOBAL_AGENTS).toBe("~/.cursor/agents/");
			expect(TOOL_VARIABLES.cursor.GLOBAL_COMMANDS).toBe("~/.cursor/commands/");
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

	describe("buildSyncCategoryList", () => {
		const repoRoot = "/repo";

		it("returns all four categories for Cursor when not using cursor-db", () => {
			const repoPaths = getCanonicalSyncRepoPaths(repoRoot);
			const list = buildSyncCategoryList(
				"/home/.cursor/rules/",
				"/home/.cursor/skills/",
				"/home/.cursor/agents/",
				"/home/.cursor/commands/",
				false,
				repoPaths,
			);
			expect(list).toHaveLength(4);
			expect(list.map((c) => c.id)).toEqual(["rules", "skills", "agents", "commands"]);
			expect(list[0]!.repoPath).toBe(join(repoRoot, "rules"));
			expect(list[3]!.repoPath).toBe(join(repoRoot, "commands"));
		});

		it("excludes rules when useCursorDb is true (cursor-db path used instead)", () => {
			const repoPaths = getCanonicalSyncRepoPaths(repoRoot);
			const list = buildSyncCategoryList(
				"/home/.cursor/rules/",
				"/home/.cursor/skills/",
				"/home/.cursor/agents/",
				"/home/.cursor/commands/",
				true,
				repoPaths,
			);
			expect(list).toHaveLength(3);
			expect(list.map((c) => c.id)).toEqual(["skills", "agents", "commands"]);
		});

		it("returns only categories with non-empty global paths", () => {
			const repoPaths = getCanonicalSyncRepoPaths(repoRoot);
			const list = buildSyncCategoryList("", "/home/skills/", "", "", false, repoPaths);
			expect(list).toHaveLength(1);
			expect(list[0]!.id).toBe("skills");
		});

		it("excludes category when repo path is empty (tool layout without that dir)", () => {
			const repoPaths = getToolSyncRepoPaths(repoRoot, "claude", TOOL_VARIABLES.claude);
			// Claude has GLOBAL_RULES but no GLOBAL_SKILLS; repoSkills is ""
			const list = buildSyncCategoryList(
				"/home/.claude/rules/",
				"/home/.claude/skills/",
				"",
				"",
				false,
				repoPaths,
			);
			expect(list).toHaveLength(1);
			expect(list[0]!.id).toBe("rules");
			expect(list[0]!.repoPath).toBe("/repo/.claude/rules");
		});

		it("filtering by selected ids yields correct subset (directory-pick contract)", () => {
			const repoPaths = getCanonicalSyncRepoPaths(repoRoot);
			const list = buildSyncCategoryList(
				"/home/.cursor/rules/",
				"/home/.cursor/skills/",
				"/home/.cursor/agents/",
				"/home/.cursor/commands/",
				false,
				repoPaths,
			);
			const selectedIds = ["skills", "agents"];
			const selected = list.filter((c) => selectedIds.includes(c.id));
			expect(selected).toHaveLength(2);
			expect(selected.map((c) => c.id)).toEqual(["skills", "agents"]);
			expect(selected.map((c) => c.repoPath)).toEqual([join(repoRoot, "skills"), join(repoRoot, "agents")]);
		});
	});

	describe("getCanonicalSyncRepoPaths", () => {
		it("returns rules, skills, agents, commands under repo root", () => {
			const p = getCanonicalSyncRepoPaths("/repo");
			expect(p.repoRules).toBe("/repo/rules");
			expect(p.repoSkills).toBe("/repo/skills");
			expect(p.repoAgents).toBe("/repo/agents");
			expect(p.repoCommands).toBe("/repo/commands");
		});
	});

	describe("getToolSyncRepoPaths", () => {
		it("uses RULES_DIR and SKILLS_DIR from vars for tool layout", () => {
			const p = getToolSyncRepoPaths("/repo", "cursor", TOOL_VARIABLES.cursor);
			expect(p.repoRules).toBe("/repo/.cursor/rules");
			expect(p.repoSkills).toBe("/repo/.cursor/skills");
			expect(p.repoAgents).toBe(join("/repo", ".cursor", "agents"));
			expect(p.repoCommands).toBe(join("/repo", ".cursor", "commands"));
		});

		it("returns empty agents/commands for non-Cursor tools", () => {
			const p = getToolSyncRepoPaths("/repo", "claude", TOOL_VARIABLES.claude);
			expect(p.repoRules).toBe("/repo/.claude/rules");
			expect(p.repoSkills).toBe("");
			expect(p.repoAgents).toBe("");
			expect(p.repoCommands).toBe("");
		});
	});

	describe("findSyncSourceDirs", () => {
		it("returns empty when dir has no rules/skills/agents/commands", async () => {
			const empty = join(syncTestRoot, "find-empty");
			await mkdir(empty, { recursive: true });
			const paths = await findSyncSourceDirs(empty);
			expect(paths).toEqual([]);
		});

		it("returns repo root when it has rules/", async () => {
			const withRules = join(syncTestRoot, "find-repo-rules");
			await mkdir(join(withRules, "rules"), { recursive: true });
			const paths = await findSyncSourceDirs(withRules);
			expect(paths).toContain("");
		});

		it("returns nested paths that have canonical layout", async () => {
			const base = join(syncTestRoot, "find-nested");
			await mkdir(join(base, "coding-tools", "cursor", "rules"), { recursive: true });
			await mkdir(join(base, "coding-tools", "claude", "skills"), { recursive: true });
			const paths = await findSyncSourceDirs(base);
			expect(paths).toContain("coding-tools/cursor");
			expect(paths).toContain("coding-tools/claude");
		});
	});

	describe("buildSyncSourceTree", () => {
		it("returns only repo root when no sync source dirs found", async () => {
			const tree = await buildSyncSourceTree(join(syncTestRoot, "tree-no-sources"));
			expect(tree).toHaveLength(1);
			expect(tree[0]!.id).toBe("repo");
			expect(tree[0]!.label).toContain("Repo root");
		});

		it("returns repo and cascaded tree when nested sources exist", async () => {
			const base = join(syncTestRoot, "tree-with-nested");
			await mkdir(join(base, "coding-tools", "cursor", "rules"), { recursive: true });
			await mkdir(join(base, "coding-tools", "claude", "rules"), { recursive: true });

			const tree = await buildSyncSourceTree(base);
			expect(tree.length).toBeGreaterThanOrEqual(1);
			const ct = tree.find((n) => n.label === "coding-tools");
			expect(ct).toBeDefined();
			expect(ct!.isDirectory).toBe(true);
			expect(ct!.children).toBeDefined();
			const childIds = ct!.children!.map((c) => c.id).filter((id) => id.startsWith("coding-tools/"));
			expect(childIds.sort()).toEqual(["coding-tools/claude", "coding-tools/cursor"]);
		});
	});

	describe("hasCanonicalSyncLayout", () => {
		it("returns false when none of the canonical dirs exist", async () => {
			const result = await hasCanonicalSyncLayout("/nonexistent-repo-root-xyz");
			expect(result).toBe(false);
		});

		it("returns true when at least one canonical dir exists", async () => {
			await mkdir(join(syncTestRoot, "rules"), { recursive: true });
			try {
				const result = await hasCanonicalSyncLayout(syncTestRoot);
				expect(result).toBe(true);
			} finally {
				await rm(syncTestRoot, { recursive: true, force: true }).catch(() => {});
			}
		});
	});
});
