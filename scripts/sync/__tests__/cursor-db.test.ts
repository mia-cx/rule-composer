import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import Database from "better-sqlite3";
import {
	getCursorStateDbPath,
	readCursorUserRules,
	writeCursorUserRules,
	composeRepoRules,
	writeCursorUserRulesToRepo,
} from "../cursor-db.js";

const CURSOR_KEY = "aicontext.personalContext";

function createTempDbPath(): string {
	return join(tmpdir(), `cursor-db-test-${Date.now()}-${Math.random().toString(36).slice(2)}.vscdb`);
}

function createTempDir(): string {
	return join(tmpdir(), `cursor-db-test-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("cursor-db", () => {
	describe("getCursorStateDbPath", () => {
		it("returns path ending with state.vscdb and containing Cursor and globalStorage", () => {
			const path = getCursorStateDbPath();
			expect(path).toContain("Cursor");
			expect(path).toContain("globalStorage");
			expect(path).toMatch(/state\.vscdb$/);
		});
	});

	describe("readCursorUserRules", () => {
		it("returns null when key is missing", async () => {
			const dbPath = createTempDbPath();
			const db = new Database(dbPath);
			db.exec("CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)");
			db.close();
			expect(readCursorUserRules(dbPath)).toBeNull();
			await rm(dbPath, { force: true }).catch(() => {});
		});

		it("returns stored UTF-8 content when key exists", async () => {
			const dbPath = createTempDbPath();
			const db = new Database(dbPath);
			db.exec("CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)");
			db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
				CURSOR_KEY,
				Buffer.from("Hello\nWorld", "utf-8"),
			);
			db.close();
			expect(readCursorUserRules(dbPath)).toBe("Hello\nWorld");
			await rm(dbPath, { force: true }).catch(() => {});
		});

		it("returns null when database file does not exist", () => {
			const path = join(tmpdir(), "nonexistent-cursor-state.vscdb");
			expect(readCursorUserRules(path)).toBeNull();
		});
	});

	describe("writeCursorUserRules", () => {
		it("creates row and writes content, readable by readCursorUserRules", async () => {
			const dbPath = createTempDbPath();
			const db = new Database(dbPath);
			db.exec("CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)");
			db.close();

			writeCursorUserRules(dbPath, "Rule one\n\nRule two");
			expect(readCursorUserRules(dbPath)).toBe("Rule one\n\nRule two");

			writeCursorUserRules(dbPath, "Replaced content");
			expect(readCursorUserRules(dbPath)).toBe("Replaced content");

			await rm(dbPath, { force: true }).catch(() => {});
		});
	});

	describe("composeRepoRules", () => {
		let rulesDir: string;

		beforeAll(async () => {
			rulesDir = createTempDir();
			await mkdir(rulesDir, { recursive: true });
			await writeFile(join(rulesDir, "02-second.mdc"), "Second file", "utf-8");
			await writeFile(join(rulesDir, "01-first.mdc"), "First file", "utf-8");
			await writeFile(join(rulesDir, ".hidden"), "ignored", "utf-8");
		});

		afterAll(async () => {
			await rm(rulesDir, { recursive: true, force: true }).catch(() => {});
		});

		it("returns files sorted by name and joined by double newline", async () => {
			const content = await composeRepoRules(rulesDir);
			expect(content).toBe("First file\n\nSecond file");
		});

		it("skips dotfiles", async () => {
			const content = await composeRepoRules(rulesDir);
			expect(content).not.toContain("ignored");
		});
	});

	describe("writeCursorUserRulesToRepo", () => {
		it("writes content to rules/cursor-user-rules.md and creates dir if needed", async () => {
			const repoRulesDir = createTempDir();
			await writeCursorUserRulesToRepo(repoRulesDir, "Pulled rules content");

			const path = join(repoRulesDir, "cursor-user-rules.md");
			const content = await readFile(path, "utf-8");
			expect(content).toBe("Pulled rules content");

			await rm(repoRulesDir, { recursive: true, force: true }).catch(() => {});
		});
	});
});
