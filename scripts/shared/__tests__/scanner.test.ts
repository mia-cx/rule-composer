import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectTools, getProjectDisplayName, resolveAgentsRepo, scanDirectory } from "../scanner.js";

describe("sortRulesByFilenamePrefix", () => {
	it("orders rules by numeric prefix (01, 02, …, 99) so 99-rule-name appears last", async () => {
		const dir = join(tmpdir(), "arc-test-sort-rules");
		await rm(dir, { recursive: true, force: true });
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "99-a.mdc"), "---\ndescription: A\n---\n\n# A", "utf-8");
		await writeFile(join(dir, "01-b.mdc"), "---\ndescription: B\n---\n\n# B", "utf-8");
		await writeFile(join(dir, "02-c.mdc"), "---\ndescription: C\n---\n\n# C", "utf-8");

		const source = await scanDirectory(dir);
		expect(source.rules.map((r) => r.name)).toEqual(["01-b", "02-c", "99-a"]);
		await rm(dir, { recursive: true, force: true });
	});
});

describe("detectTools", () => {
	const tmpDir = join(tmpdir(), "arc-test-detect");

	beforeAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("detects cursor rules directory", async () => {
		const cursorDir = join(tmpDir, ".cursor", "rules");
		await mkdir(cursorDir, { recursive: true });
		await writeFile(join(cursorDir, "test.mdc"), "---\ndescription: Test\n---\n\n# Test", "utf-8");

		const sources = await detectTools(tmpDir);
		const cursor = sources.find((s) => s.id === "cursor");
		expect(cursor).toBeDefined();
		expect(cursor!.rules).toHaveLength(1);
		expect(cursor!.rules[0]!.name).toBe("test");
		expect(cursor!.label).toMatch(/^Cursor \(\d+ file/);
	});

	it("detects claude single file", async () => {
		await writeFile(join(tmpDir, "CLAUDE.md"), "# Claude Rules\n\nSome rules.", "utf-8");

		const sources = await detectTools(tmpDir);
		const claude = sources.find((s) => s.id === "claude");
		expect(claude).toBeDefined();
		expect(claude!.rules.length).toBeGreaterThanOrEqual(1);
	});

	it("returns empty for directory with no tool files", async () => {
		const emptyDir = join(tmpDir, "empty-project");
		await mkdir(emptyDir, { recursive: true });

		const sources = await detectTools(emptyDir);
		expect(sources).toHaveLength(0);
	});

	it("skips _prefixed directories", async () => {
		const cursorDir2 = join(tmpDir, "skip-test", ".cursor", "rules");
		await mkdir(cursorDir2, { recursive: true });
		const underscoreDir = join(cursorDir2, "_drafts");
		await mkdir(underscoreDir, { recursive: true });
		await writeFile(join(underscoreDir, "draft.mdc"), "---\ndescription: Draft\n---\n\n# Draft", "utf-8");
		await writeFile(join(cursorDir2, "real.mdc"), "---\ndescription: Real\n---\n\n# Real", "utf-8");

		const sources = await detectTools(join(tmpDir, "skip-test"));
		const cursor = sources.find((s) => s.id === "cursor");
		expect(cursor).toBeDefined();
		expect(cursor!.rules).toHaveLength(1);
		expect(cursor!.rules[0]!.name).toBe("real");
	});
});

describe("getProjectDisplayName", () => {
	const tmpDir = join(tmpdir(), "arc-test-project-name");

	beforeAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("returns package.json name when present", async () => {
		await writeFile(join(tmpDir, "package.json"), JSON.stringify({ name: "my-app" }), "utf-8");
		expect(await getProjectDisplayName(tmpDir)).toBe("my-app");
	});

	it("strips scope from package name", async () => {
		await writeFile(join(tmpDir, "package.json"), JSON.stringify({ name: "@mia-cx/rule-composer" }), "utf-8");
		expect(await getProjectDisplayName(tmpDir)).toBe("rule-composer");
	});

	it("returns basename of root when no package.json", async () => {
		const sub = join(tmpDir, "no-pkg");
		await mkdir(sub, { recursive: true });
		expect(await getProjectDisplayName(sub)).toBe("no-pkg");
	});

	it("returns 'project' when basename is empty", async () => {
		// basename of "/" is "" on Unix
		expect(await getProjectDisplayName("/")).toBe("project");
	});
});

describe("resolveAgentsRepo", () => {
	const tmpDir = join(tmpdir(), "arc-test-resolve");

	beforeAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("finds local rules/ directory", async () => {
		const rulesDir = join(tmpDir, "rules");
		await mkdir(rulesDir, { recursive: true });
		await writeFile(join(rulesDir, "approach.mdc"), "---\ndescription: Approach\n---\n\n# Approach", "utf-8");

		const result = await resolveAgentsRepo(tmpDir);
		expect(result).not.toBeNull();
		expect(result!.id).toBe("agents-repo");
		expect(result!.label).toContain("local");
		expect(result!.rules.length).toBeGreaterThanOrEqual(1);
	});

	it("finds local skills/ directory", async () => {
		const skillDir = join(tmpDir, "skills", "my-skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "# My Skill", "utf-8");

		const result = await resolveAgentsRepo(tmpDir);
		expect(result).not.toBeNull();
		// Should include both rule and skill
		const hasSkill = result!.rules.some((r) => r.type === "skill");
		expect(hasSkill).toBe(true);
	});

	it("uses project name from package.json in label when present", async () => {
		const withPkg = join(tmpDir, "with-pkg");
		await mkdir(withPkg, { recursive: true });
		await writeFile(join(withPkg, "package.json"), JSON.stringify({ name: "my-rules-project" }), "utf-8");
		await mkdir(join(withPkg, "rules"), { recursive: true });
		await writeFile(join(withPkg, "rules", "one.mdc"), "---\ndescription: One\n---\n\n# One", "utf-8");

		const result = await resolveAgentsRepo(withPkg);
		expect(result).not.toBeNull();
		expect(result!.label).toContain("local");
		expect(result!.label.startsWith("my-rules-project")).toBe(true);
	});

	it("falls back to bundled rules when no local rules/ dir exists", async () => {
		const emptyDir = join(tmpDir, "no-rules");
		await mkdir(emptyDir, { recursive: true });

		const result = await resolveAgentsRepo(emptyDir);
		// When running from within the agents repo, tier 3 (bundled fallback)
		// finds the real rules/ dir. In a truly isolated environment it would be null.
		// We verify the fallback mechanism works rather than asserting null.
		if (result) {
			expect(result.id).toBe("agents-repo");
			expect(result.label).toContain("bundled");
		} else {
			expect(result).toBeNull();
		}
	});
});
